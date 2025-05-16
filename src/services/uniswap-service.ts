import { ethers } from 'ethers';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import { Pool, Route, Trade, FeeAmount, TickListDataProvider, Tick, TickMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { Contract as MulticallContract, Provider as MulticallProvider } from 'ethers-multicall';

import config from '../../config/default';
import { Logger } from '../utils/logger';

const ARBITRUM_ONE_CHAIN_ID = 42161;
const UNISWAP_V3_FACTORY_ADDRESS_ARBITRUM = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for tick data cache - This will be less relevant with proactive updates
const DEFAULT_BACKGROUND_UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute

// Helper to get tick spacing from FeeAmount
function feeToTickSpacing(feeAmount: FeeAmount): number {
  switch (feeAmount) {
    case FeeAmount.LOWEST: return 1; // 0.01%
    case FeeAmount.LOW: return 10;   // 0.05%
    case FeeAmount.MEDIUM: return 60;  // 0.30%
    case FeeAmount.HIGH: return 200;   // 1.00%
    default: throw new Error(`Unknown fee amount: ${feeAmount}`);
  }
}

export class UniswapService {
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly logger: Logger;
  private multicallProvider: MulticallProvider | null = null;
  private tickCache = new Map<string, { data: Tick[], timestamp: number }>();
  private isBackgroundUpdaterRunning = false;
  private backgroundUpdaterAbortController: AbortController | null = null;

  // Target pool for background updates - can be expanded later
  private poolsToUpdateInBackground: Array<{address: string, fee: FeeAmount, tickSpacing: number}> = [];

  constructor(logger: Logger) {
    this.logger = logger;
    this.provider = new ethers.providers.JsonRpcProvider(config.arbitrum.rpcUrl);
    this.logger.info(
      `Initialized Uniswap Service with SDK V3. RPC: ${config.arbitrum.rpcUrl}`,
    );
    this._initializeMulticallProvider();
    this._configurePoolsToUpdate(); // New method to setup target pools
  }

  private async _initializeMulticallProvider() {
    if (!this.multicallProvider) {
        try {
            // Chain ID is required by ethers-multicall Provider constructor
            const network = await this.provider.getNetwork();
            this.multicallProvider = new MulticallProvider(this.provider, network.chainId);
            // The init() call is part of older ethers-multicall examples, 
            // newer versions might not need it or it might auto-init.
            // For now, we assume it's not strictly needed unless errors appear.
            // await this.multicallProvider.init(); // Example from Uniswap docs, might be version dependent
            this.logger.info('MulticallProvider initialized successfully.');
        } catch (error: any) {
            this.logger.error(`Failed to initialize MulticallProvider: ${error.message}`, error.stack);
            this.multicallProvider = null; // Ensure it's null if init fails
        }
    }
  }

  private _configurePoolsToUpdate() {
    // For now, hardcode the USDC/USDT 0.01% pool
    // In a real app, this might come from config or dynamic discovery
    const usdcToken = this.getToken('USDC');
    const usdtToken = this.getToken('USDT');
    const targetFee = FeeAmount.LOWEST;
    try {
        const poolAddress = Pool.getAddress(usdcToken, usdtToken, targetFee, undefined, UNISWAP_V3_FACTORY_ADDRESS_ARBITRUM);
        this.poolsToUpdateInBackground.push({
            address: poolAddress,
            fee: targetFee,
            tickSpacing: feeToTickSpacing(targetFee)
        });
        this.logger.info(`Configured background updates for pool: ${poolAddress} (USDC/USDT LOWEST Fee)`);
    } catch(error: any) {
        this.logger.error(`Failed to configure background update pool: ${error.message}`);
    }
  }

  public getToken(symbol: string): Token {
    const normalizedSymbol = symbol.toLowerCase();
    switch (normalizedSymbol) {
      case 'usdc':
        return new Token(
          ARBITRUM_ONE_CHAIN_ID,
          ethers.utils.getAddress('0xaf88d065e77c8cc2239327c5edb3a432268e5831'),
          6,
          'USDC',
          'USD Coin',
        );
      case 'usdt':
        return new Token(
          ARBITRUM_ONE_CHAIN_ID,
          ethers.utils.getAddress('0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'),
          6,
          'USDT',
          'Tether USD',
        );
      case 'weth':
        return new Token(
          ARBITRUM_ONE_CHAIN_ID,
          ethers.utils.getAddress('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'),
          18,
          'WETH',
          'Wrapped Ether',
        );
      case 'arb':
        return new Token(
          ARBITRUM_ONE_CHAIN_ID,
          ethers.utils.getAddress('0x912ce59144191c1204e64559fe8253a0e49e6548'),
          18,
          'ARB',
          'Arbitrum',
        );
      default:
        this.logger.error(`Token not defined in UniswapService getToken: ${symbol}`);
        throw new Error(`Token not defined: ${symbol}`);
    }
  }

  /**
   * Calculates the word position for a given tick and tickSpacing.
   * A word represents 256 ticks.
   */
  private _tickToWord(tick: number, tickSpacing: number): number {
    let compressed = Math.floor(tick / tickSpacing);
    if (tick < 0 && tick % tickSpacing !== 0) {
      compressed -= 1; // Adjust for negative ticks not perfectly divisible
    }
    return compressed >> 8; // Divide by 256 (shift right by 8 bits)
  }

  // Method to fetch and cache ticks for a specific pool - to be used by background worker
  private async _refreshTickDataForPool(poolAddress: string, tickSpacing: number, feeForLogging: FeeAmount): Promise<void> {
    this.logger.info(`Background Updater: Refreshing tick data for pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]}`);
    try {
        // This internal method will do the actual fetching logic (bitmaps, then ticks)
        // It's essentially the core of the old _fetchAllInitializedTicks but without the cache read part,
        // and it directly updates the cache.
        // For simplicity in this refactor, we'll reuse parts of the existing _fetchAllInitializedTicks logic
        // but ensure it updates the cache.

        if (!this.multicallProvider) {
            await this._initializeMulticallProvider();
            if (!this.multicallProvider) {
                this.logger.error(`Background Updater: MulticallProvider not available for ${poolAddress}. Skipping update.`);
                return;
            }
        }

        const multicallPoolContract = new MulticallContract(poolAddress, IUniswapV3PoolABI.abi as any);
        const minWord = this._tickToWord(TickMath.MIN_TICK, tickSpacing);
        const maxWord = this._tickToWord(TickMath.MAX_TICK, tickSpacing);
        const BATCH_SIZE = 700;
        const tickIndicesToFetch: number[] = [];
        const wordPositions: number[] = [];
        for (let i = minWord; i <= maxWord; i++) { wordPositions.push(i); }

        let allBitmapResults: ethers.utils.Result[] = [];
        for (let i = 0; i < wordPositions.length; i += BATCH_SIZE) {
            const batchWordPositions = wordPositions.slice(i, i + BATCH_SIZE);
            const bitmapCalls = batchWordPositions.map(pos => multicallPoolContract.tickBitmap(pos));
            allBitmapResults = allBitmapResults.concat(await this.multicallProvider.all(bitmapCalls));
        }

        for (let i = 0; i < allBitmapResults.length; i++) {
            const bitmapWordIndex = wordPositions[i];
            const bitmap = JSBI.BigInt(allBitmapResults[i].toString());
            if (JSBI.notEqual(bitmap, JSBI.BigInt(0))) {
                for (let j = 0; j < 256; j++) {
                    const bit = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(j));
                    if (JSBI.notEqual(JSBI.bitwiseAnd(bitmap, bit), JSBI.BigInt(0))) {
                        const tickIndex = (bitmapWordIndex * 256 + j) * tickSpacing;
                        if (tickIndex >= TickMath.MIN_TICK && tickIndex <= TickMath.MAX_TICK) {
                            tickIndicesToFetch.push(tickIndex);
                        }
                    }
                }
            }
        }
        tickIndicesToFetch.sort((a, b) => a - b);

        if (tickIndicesToFetch.length === 0) {
            this.logger.warn(`Background Updater: No initialized tick indices found from bitmaps for ${poolAddress}. Cache not updated.`);
            return;
        }

        const allInitializedTicks: Tick[] = [];
        let allTickDataResults: ethers.utils.Result[] = [];
        for (let i = 0; i < tickIndicesToFetch.length; i += BATCH_SIZE) {
            const batchTickIndices = tickIndicesToFetch.slice(i, i + BATCH_SIZE);
            const tickDataCalls = batchTickIndices.map(idx => multicallPoolContract.ticks(idx));
            allTickDataResults = allTickDataResults.concat(await this.multicallProvider.all(tickDataCalls));
        }

        for (let i = 0; i < allTickDataResults.length; i++) {
            const tickIndex = tickIndicesToFetch[i];
            const tickData = allTickDataResults[i];
            allInitializedTicks.push(new Tick({ index: tickIndex, liquidityGross: JSBI.BigInt(tickData.liquidityGross.toString()), liquidityNet: JSBI.BigInt(tickData.liquidityNet.toString()) }));
        }

        if (allInitializedTicks.length > 0) {
            this.tickCache.set(poolAddress, { data: allInitializedTicks, timestamp: Date.now() });
            this.logger.info(`Background Updater: Successfully refreshed and cached ${allInitializedTicks.length} ticks for pool ${poolAddress}.`);
        } else {
            this.logger.warn(`Background Updater: No ticks found after detail fetch for ${poolAddress}. Cache not updated.`);
        }

    } catch (error: any) {
        this.logger.error(`Background Updater: Error refreshing tick data for pool ${poolAddress}: ${error.message}`, error.stack);
    }
  }

  public startBackgroundTickUpdater(updateIntervalMs: number = DEFAULT_BACKGROUND_UPDATE_INTERVAL_MS): void {
    if (this.isBackgroundUpdaterRunning) {
        this.logger.warn('Background tick updater is already running.');
        return;
    }
    this.backgroundUpdaterAbortController = new AbortController();
    const signal = this.backgroundUpdaterAbortController.signal;
    this.isBackgroundUpdaterRunning = true;
    this.logger.info(`Starting background tick updater. Update interval: ${updateIntervalMs / 1000}s`);

    const worker = async () => {
        while (!signal.aborted) {
            this.logger.info('Background Updater: Starting tick update cycle.');
            for (const poolInfo of this.poolsToUpdateInBackground) {
                if (signal.aborted) break;
                await this._refreshTickDataForPool(poolInfo.address, poolInfo.tickSpacing, poolInfo.fee);
            }
            if (signal.aborted) break;
            this.logger.info(`Background Updater: Tick update cycle complete. Waiting for ${updateIntervalMs / 1000}s.`);
            try {
                await new Promise(resolve => setTimeout(resolve, updateIntervalMs, { signal } as any)); // Pass signal to setTimeout if supported/needed for interruption
            } catch (error:any) { // Catch if AbortError from setTimeout signal
                 if (error.name === 'AbortError') {
                    this.logger.info('Background Updater: Wait aborted.');
                    break;
                 }
                 // other errors during wait?
            }
        }
        this.logger.info('Background tick updater stopped.');
        this.isBackgroundUpdaterRunning = false;
    };

    worker().catch(error => {
        this.logger.error('Background tick updater worker encountered an unhandled error:', error);
        this.isBackgroundUpdaterRunning = false; // Ensure flag is reset
    });
  }

  public stopBackgroundTickUpdater(): void {
    if (this.backgroundUpdaterAbortController) {
        this.logger.info('Stopping background tick updater...');
        this.backgroundUpdaterAbortController.abort();
        this.backgroundUpdaterAbortController = null;
    }
  }

  // This is the primary method called by getBestV3TradeExactIn
  private async _fetchAllInitializedTicks(
    poolAddress: string, 
    tickSpacing: number,
    feeForLogging: FeeAmount
  ): Promise<Tick[]> {
    const cacheKey = poolAddress;
    const cachedEntry = this.tickCache.get(cacheKey);

    // With proactive caching, TTL is less important here, but we check freshness for initial calls 
    // or if the background worker is slower than the request rate.
    // A very short effective TTL or just checking for existence might be enough.
    const REASONABLE_STALENESS_MS = DEFAULT_BACKGROUND_UPDATE_INTERVAL_MS * 2; // e.g., allow data to be twice the update interval old

    if (cachedEntry && (Date.now() - cachedEntry.timestamp < REASONABLE_STALENESS_MS)) {
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Cache HIT (Proactive Cache) for tick data. Age: ${((Date.now() - cachedEntry.timestamp)/1000).toFixed(1)}s.`);
        return cachedEntry.data;
    }

    if (cachedEntry) {
        this.logger.warn(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Proactive cache data is STALE or worker hasn't run recently. Age: ${((Date.now() - cachedEntry.timestamp)/1000).toFixed(1)}s. Performing on-demand fetch.`);
    } else {
        this.logger.warn(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Cache MISS (Proactive Cache). Performing on-demand fetch.`);
    }
    
    // On-demand fetch logic (same as _refreshTickDataForPool's core but returns data and caches)
    // This ensures data is available even if the background worker hasn't run yet or is delayed.
    this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | On-demand: Fetching ALL initialized ticks using batched multicall...`);
    // ... (Duplicating the core fetching logic from _refreshTickDataForPool here) ...
    // This is not ideal. Let's refactor to have a single core fetching method.
    // For now, this will be a direct copy-paste of the fetching part from _refreshTickDataForPool
    // and then it will cache and return.

    // --- BEGIN Inlined Fetch Logic for On-Demand --- 
    if (!this.multicallProvider) {
        await this._initializeMulticallProvider();
        if (!this.multicallProvider) { return []; }
    }
    const multicallPoolContract = new MulticallContract(poolAddress, IUniswapV3PoolABI.abi as any);
    const allInitializedTicksInternal: Tick[] = [];
    const minWord = this._tickToWord(TickMath.MIN_TICK, tickSpacing);
    const maxWord = this._tickToWord(TickMath.MAX_TICK, tickSpacing);
    const BATCH_SIZE = 700;
    const tickIndicesToFetchInternal: number[] = [];
    const wordPositionsInternal: number[] = [];
    for (let i = minWord; i <= maxWord; i++) { wordPositionsInternal.push(i); }
    let allBitmapResultsInternal: ethers.utils.Result[] = [];
    try {
        for (let i = 0; i < wordPositionsInternal.length; i += BATCH_SIZE) {
            const batchWordPositions = wordPositionsInternal.slice(i, i + BATCH_SIZE);
            const bitmapCalls = batchWordPositions.map(pos => multicallPoolContract.tickBitmap(pos));
            allBitmapResultsInternal = allBitmapResultsInternal.concat(await this.multicallProvider.all(bitmapCalls));
        }
        for (let i = 0; i < allBitmapResultsInternal.length; i++) {
            const bitmapWordIndex = wordPositionsInternal[i];
            const bitmap = JSBI.BigInt(allBitmapResultsInternal[i].toString());
            if (JSBI.notEqual(bitmap, JSBI.BigInt(0))) {
                for (let j = 0; j < 256; j++) {
                    const bit = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(j));
                    if (JSBI.notEqual(JSBI.bitwiseAnd(bitmap, bit), JSBI.BigInt(0))) {
                        const tickIndex = (bitmapWordIndex * 256 + j) * tickSpacing;
                        if (tickIndex >= TickMath.MIN_TICK && tickIndex <= TickMath.MAX_TICK) {
                            tickIndicesToFetchInternal.push(tickIndex);
                        }
                    }
                }
            }
        }
    } catch (e:any) { this.logger.error(`On-demand bitmap fetch error for ${poolAddress}: ${e.message}`); return []; }
    tickIndicesToFetchInternal.sort((a, b) => a - b);
    if (tickIndicesToFetchInternal.length === 0) { this.logger.warn(`On-demand: No ticks for ${poolAddress}`); return []; }
    let allTickDataResultsInternal: ethers.utils.Result[] = [];
    try {
        for (let i = 0; i < tickIndicesToFetchInternal.length; i += BATCH_SIZE) {
            const batchTickIndices = tickIndicesToFetchInternal.slice(i, i + BATCH_SIZE);
            const tickDataCalls = batchTickIndices.map(idx => multicallPoolContract.ticks(idx));
            allTickDataResultsInternal = allTickDataResultsInternal.concat(await this.multicallProvider.all(tickDataCalls));
        }
        for (let i = 0; i < allTickDataResultsInternal.length; i++) {
            const tickIndex = tickIndicesToFetchInternal[i];
            const tickData = allTickDataResultsInternal[i];
            allInitializedTicksInternal.push(new Tick({ index: tickIndex, liquidityGross: JSBI.BigInt(tickData.liquidityGross.toString()), liquidityNet: JSBI.BigInt(tickData.liquidityNet.toString()) }));
        }
    } catch (e:any) { this.logger.error(`On-demand tick data fetch error for ${poolAddress}: ${e.message}`); return []; }
    // --- END Inlined Fetch Logic for On-Demand ---

    if (allInitializedTicksInternal.length > 0) {
        this.tickCache.set(cacheKey, { data: allInitializedTicksInternal, timestamp: Date.now() });
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | On-demand: Successfully fetched and cached ${allInitializedTicksInternal.length} ticks.`);
        return allInitializedTicksInternal;
    } else {
        this.logger.warn(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | On-demand: No initialized ticks found. Result not cached.`);
        return [];
    }
  }

  public async getBestV3TradeExactIn(
    tokenIn: Token,
    tokenOut: Token,
    amountInRaw: string, // Amount in base units as a string
  ): Promise<Trade<Token, Token, TradeType.EXACT_INPUT> | null> {
    const amountIn = CurrencyAmount.fromRawAmount(tokenIn, amountInRaw);
    const feeTiersToTry: FeeAmount[] = [FeeAmount.LOWEST]; // Focus on only the lowest fee tier
    let bestTrade: Trade<Token, Token, TradeType.EXACT_INPUT> | null = null;
    this.logger.info(
      `Finding best Uniswap V3 trade for ${amountIn.toSignificant(6)} ${tokenIn.symbol} -> ${tokenOut.symbol}`,
    );

    // Ensure multicall provider is ready before starting loop
    if (!this.multicallProvider) {
        await this._initializeMulticallProvider();
        if (!this.multicallProvider) {
            this.logger.error('MulticallProvider could not be initialized. Aborting trade finding.');
            throw new Error('MulticallProvider initialization failed');
        }
    }

    for (const fee of feeTiersToTry) {
      const [sortedTokenA, sortedTokenB] = tokenIn.sortsBefore(tokenOut) ? [tokenIn, tokenOut] : [tokenOut, tokenIn];
      const poolAddress = Pool.getAddress(
        sortedTokenA,
        sortedTokenB,
        fee,
        undefined,
        UNISWAP_V3_FACTORY_ADDRESS_ARBITRUM,
      );
      this.logger.info(
        `Attempting V3 pool for ${tokenIn.symbol}/${tokenOut.symbol} (Sorted: ${sortedTokenA.symbol}/${sortedTokenB.symbol}) | Fee: ${FeeAmount[fee]} (${fee}) | Computed Address: ${poolAddress}`
      );

      const tickSpacing = feeToTickSpacing(fee);
      // Use a regular ethers.Contract for single calls like slot0 and liquidity
      const regularPoolContract = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, this.provider);

      try {
        const [slot0Result, totalLiquidityResult] = await Promise.all([
            regularPoolContract.slot0(),
            regularPoolContract.liquidity(),
        ]);
        
        const currentMarketTick = slot0Result.tick;
        const sqrtPriceX96 = slot0Result.sqrtPriceX96;
        
        const allInitializedTicks = await this._fetchAllInitializedTicks(
            poolAddress, 
            tickSpacing, 
            fee
        );

        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[fee]} | Slot0 successful. Current tick: ${currentMarketTick}, SqrtPriceX96: ${sqrtPriceX96.toString()}`);
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[fee]} | Total Liquidity: ${totalLiquidityResult.toString()}`);
        
        if (totalLiquidityResult.eq(0) || allInitializedTicks.length === 0) {
          this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[fee]} | No liquidity or no initialized ticks found. Skipping this fee tier.`);
          continue;
        }
        
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[fee]} | Preparing to construct Pool object with ${allInitializedTicks.length} fetched ticks.`);
        
        const tickDataProvider = new TickListDataProvider(allInitializedTicks, tickSpacing);
        
        const currentPool = new Pool(
          sortedTokenA,
          sortedTokenB,
          fee,
          sqrtPriceX96.toString(),
          totalLiquidityResult.toString(),
          currentMarketTick,
          tickDataProvider,
        );
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[fee]} | Pool object constructed successfully.`);

        try {
          this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[fee]} | Constructing route and trade...`);
          const route = new Route([currentPool], tokenIn, tokenOut);
          const trade = await Trade.fromRoute(route, amountIn, TradeType.EXACT_INPUT);

          this.logger.info(
            `Found V3 trade via fee ${FeeAmount[fee]} (${fee}): ${trade.outputAmount.toSignificant(6)} ${tokenOut.symbol}`,
          );

          if (!bestTrade || trade.outputAmount.greaterThan(bestTrade.outputAmount)) {
            bestTrade = trade;
            this.logger.info(`New best trade found with fee ${FeeAmount[fee]}`);
          }
        } catch (tradeError: any) {
          this.logger.warn(
            `Trade construction failed for pool ${poolAddress} with fee ${FeeAmount[fee]}: ${tradeError.message}`,
          );
          if (tradeError.message.includes("ZERO_NET") || tradeError.message.includes("LIQUIDITY_NET")) {
            this.logger.error(`Trade Error details for Pool ${poolAddress} | Fee ${FeeAmount[fee]}: ${tradeError.stack || tradeError}`);
          }
        }
      } catch (poolSetupError: any) {
        this.logger.error(
          `Error setting up pool or fetching all ticks for ${poolAddress} with fee ${FeeAmount[fee]}: ${poolSetupError.message}`, poolSetupError.stack
        );
      }
    }

    if (bestTrade) {
      this.logger.info(
        `Best Uniswap V3 trade found: ${bestTrade.executionPrice.toSignificant(6)} ${tokenOut.symbol} per ${tokenIn.symbol}. Input: ${amountIn.toSignificant(6)} ${tokenIn.symbol}, Output: ${bestTrade.outputAmount.toSignificant(6)} ${tokenOut.symbol}`,
      );
      return bestTrade;
    } else {
      this.logger.error(
        `No suitable Uniswap V3 route found for ${tokenIn.symbol} -> ${tokenOut.symbol} after checking all fee tiers.`,
      );
      throw new Error(
        `No V3 route found for ${tokenIn.symbol} to ${tokenOut.symbol}`,
      );
    }
  }

  /** @deprecated Prefer getBestV3TradeExactIn for accurate quoting using Uniswap V3 SDK. */
  async getSwapQuote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountInString: string,
  ): Promise<string> {
    this.logger.warn(
      'getSwapQuote is deprecated. Using getBestV3TradeExactIn as a shim.',
    );
    try {
      const tokenIn = this.getToken(tokenInSymbol);
      const tokenOut = this.getToken(tokenOutSymbol);
      const trade = await this.getBestV3TradeExactIn(
        tokenIn,
        tokenOut,
        amountInString,
      );
      if (trade) {
        return ethers.utils.parseUnits(
          trade.outputAmount.toSignificant(tokenOut.decimals),
          tokenOut.decimals,
        ).toString();
      }
      throw new Error(
        'Shimmed getSwapQuote (getBestV3TradeExactIn) returned null trade',
      );
    } catch (error) {
      this.logger.error(`getSwapQuote (shim) failed: ${error}`);
      throw error;
    }
  }

  /** @deprecated Subgraph queries are not used for pricing with the SDK approach. */
  async getPool(
    token0Symbol: string,
    token1Symbol: string,
    feeTier?: string,
  ): Promise<any> {
    this.logger.warn("getPool (subgraph) is deprecated.");
    throw new Error("getPool (subgraph) is deprecated.");
  }

  /** @deprecated getTokenPrice using subgraph data is less reliable. */
  async getTokenPrice(
    targetTokenSymbol: string,
    baseTokenSymbol: string,
  ): Promise<number> {
    this.logger.warn("getTokenPrice (subgraph) is deprecated.");
    throw new Error("getTokenPrice (subgraph) is deprecated.");
  }

  /** @deprecated Pool active checks via subgraph may not be accurate. */
  async isPoolActive(token0: string, token1: string): Promise<boolean> {
    this.logger.warn("isPoolActive (subgraph) is deprecated.");
    return false;
  }

  async getCurrentGasPrice(): Promise<string> {
    try {
      const gasPrice = await this.provider.getGasPrice();
      return ethers.utils.formatUnits(gasPrice, 'gwei');
    } catch (error) {
      this.logger.error(
        `Failed to get current gas price: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new Error('Failed to get current gas price');
    }
  }
}

