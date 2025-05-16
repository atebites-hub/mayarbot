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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for tick data cache

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

  constructor(logger: Logger) {
    this.logger = logger;
    this.provider = new ethers.providers.JsonRpcProvider(config.arbitrum.rpcUrl);
    this.logger.info(
      `Initialized Uniswap Service with SDK V3. RPC: ${config.arbitrum.rpcUrl}`,
    );
    // Initialize multicall provider once
    this._initializeMulticallProvider();
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

  /**
   * Fetches all initialized ticks for a given pool.
   * TODO: Optimize with multicall for fetching bitmaps and tick data.
   */
  private async _fetchAllInitializedTicks(
    poolAddress: string, 
    tickSpacing: number,
    feeForLogging: FeeAmount
  ): Promise<Tick[]> {
    // Cache key is simply the pool address as it's unique per fee tier due to how it's computed
    const cacheKey = poolAddress;
    const cachedEntry = this.tickCache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Cache HIT for tick data. Age: ${((Date.now() - cachedEntry.timestamp)/1000).toFixed(1)}s.`);
        return cachedEntry.data;
    }
    if (cachedEntry) {
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Cache STALE for tick data. Re-fetching. Age: ${((Date.now() - cachedEntry.timestamp)/1000).toFixed(1)}s.`);
    } else {
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Cache MISS for tick data. Fetching...`);
    }

    this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Fetching ALL initialized ticks using batched multicall...`);
    
    if (!this.multicallProvider) {
        this.logger.warn('MulticallProvider is not initialized. Attempting to re-initialize for _fetchAllInitializedTicks.');
        await this._initializeMulticallProvider();
        if (!this.multicallProvider) {
             this.logger.error('MulticallProvider re-initialization failed. Aborting tick fetch for this pool/fee.');
             return [];
        }
    }

    const multicallPoolContract = new MulticallContract(poolAddress, IUniswapV3PoolABI.abi as any);
    const allInitializedTicks: Tick[] = [];
    const minWord = this._tickToWord(TickMath.MIN_TICK, tickSpacing);
    const maxWord = this._tickToWord(TickMath.MAX_TICK, tickSpacing);
    const tickIndicesToFetch: number[] = [];
    const BATCH_SIZE = 700; // Optimal batch size from optimizer script

    this.logger.debug(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Word range for bitmaps: ${minWord} to ${maxWord}. Batch size: ${BATCH_SIZE}`);

    // Batch fetch bitmaps
    let allBitmapResults: ethers.utils.Result[] = [];
    const wordPositions: number[] = [];
    for (let i = minWord; i <= maxWord; i++) {
        wordPositions.push(i);
    }

    try {
        for (let i = 0; i < wordPositions.length; i += BATCH_SIZE) {
            const batchWordPositions = wordPositions.slice(i, i + BATCH_SIZE);
            const bitmapCalls = batchWordPositions.map(pos => multicallPoolContract.tickBitmap(pos));
            this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Executing multicall for bitmap batch ${i/BATCH_SIZE + 1}/${Math.ceil(wordPositions.length/BATCH_SIZE)} (size ${bitmapCalls.length})`);
            const batchResults = await this.multicallProvider.all(bitmapCalls);
            allBitmapResults = allBitmapResults.concat(batchResults);
        }
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Received all ${allBitmapResults.length} bitmap results from ${Math.ceil(wordPositions.length/BATCH_SIZE)} batches.`);

        for (let i = 0; i < allBitmapResults.length; i++) {
            const bitmapWordIndex = wordPositions[i]; // Use original word position from the pre-batched list
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
    } catch (error: any) {
      this.logger.error(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Batched multicall for bitmaps failed: ${error.message}`, error.stack);
      return []; 
    }

    // Batch fetch tick data for ALL tickIndicesToFetch
    let allTickDataResults: ethers.utils.Result[] = [];
    try {
        for (let i = 0; i < tickIndicesToFetch.length; i += BATCH_SIZE) {
            const batchTickIndices = tickIndicesToFetch.slice(i, i + BATCH_SIZE);
            const tickDataCalls = batchTickIndices.map(idx => multicallPoolContract.ticks(idx));
            this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Executing multicall for tick data batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(tickIndicesToFetch.length/BATCH_SIZE)} (size ${tickDataCalls.length})`);
            const batchResults = await this.multicallProvider.all(tickDataCalls);
            allTickDataResults = allTickDataResults.concat(batchResults);
        }
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Received all ${allTickDataResults.length} tick data results from ${Math.ceil(tickIndicesToFetch.length/BATCH_SIZE)} batches.`);

        for (let i = 0; i < allTickDataResults.length; i++) {
            const tickIndex = tickIndicesToFetch[i]; 
            const tickData = allTickDataResults[i];
            allInitializedTicks.push(
                new Tick({
                    index: tickIndex,
                    liquidityGross: JSBI.BigInt(tickData.liquidityGross.toString()),
                    liquidityNet: JSBI.BigInt(tickData.liquidityNet.toString()),
                }),
            );
        }
    } catch (error: any) {
      this.logger.error(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Batched multicall for tick details failed: ${error.message}`, error.stack);
      // Depending on requirements, we might return partially fetched ticks or empty
      // For now, if any batch fails, we return empty to ensure data integrity for the Pool constructor.
      return []; 
    }

    if (allInitializedTicks.length > 0) { // Only cache if we actually got some ticks
        this.tickCache.set(cacheKey, { data: allInitializedTicks, timestamp: Date.now() });
        this.logger.info(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | Successfully fetched and cached ${allInitializedTicks.length} ticks.`);
    } else {
        // If no ticks were found, we might not want to cache an empty result aggressively,
        // or we might cache it with a shorter TTL if it implies the pool is genuinely empty.
        // For now, just log if it was an empty result after fetching.
        this.logger.warn(`Pool ${poolAddress} | Fee ${FeeAmount[feeForLogging]} | No initialized ticks found after full fetch. Result not cached.`);
    }
    return allInitializedTicks;
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
