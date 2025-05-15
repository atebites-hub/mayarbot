import axios from 'axios';
import { ethers } from 'ethers';
import config from '../../config/default';
import { UniswapPool } from '../types';
import { Logger } from '../utils/logger';

/**
 * Service class for interacting with Uniswap V3 on Arbitrum
 */
export class UniswapService {
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly subgraphUrl: string;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.provider = new ethers.providers.JsonRpcProvider(config.arbitrum.rpcUrl);
    if (config.graph.apiKey) {
      this.subgraphUrl = `https://gateway.thegraph.com/api/${config.graph.apiKey}/subgraphs/id/${config.arbitrum.uniswapSubgraphId}`;
    } else {
      // Fallback to public unauthenticated explorer endpoint (may have rate limits or deprecation)
      this.subgraphUrl = `https://api.thegraph.com/subgraphs/id/${config.arbitrum.uniswapSubgraphId}`;
    }
    
    this.logger.info(`Initialized Uniswap Service with RPC URL: ${config.arbitrum.rpcUrl}`);
    this.logger.info(`Initialized Uniswap Service with Subgraph URL: ${this.subgraphUrl}`);
  }

  /**
   * Fetches pool data from Uniswap V3 subgraph for a specific token pair
   * @param token0 The first token symbol (e.g., 'USDC')
   * @param token1 The second token symbol (e.g., 'ARB')
   * @param feeTier Optional fee tier filter (e.g., '3000' for 0.3%)
   * @returns Pool data
   */
  async getPool(token0: string, token1: string, feeTier?: string): Promise<UniswapPool> {
    try {
      this.logger.debug(`Fetching Uniswap pool data for ${token0}/${token1}`);

      // Hard-coded token address map (Arbitrum One)
      const tokenAddressMap: Record<string, string> = {
        ARB: '0x912ce59144191c1204e64559fe8253a0e49e6548',
        USDC: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
        'USDC.E': '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',
      };

      const lowerAddr0 = tokenAddressMap[token0.toUpperCase()];
      const lowerAddr1 = tokenAddressMap[token1.toUpperCase()];

      if (!lowerAddr0 || !lowerAddr1) {
        throw new Error(`Unknown token symbols ${token0} or ${token1}`);
      }

      // GraphQL query using liquidityPools entity from the DEX AMM schema
      const query = `{
        liquidityPools(
          where: { inputTokens_contains: [\"${lowerAddr0}\", \"${lowerAddr1}\"] },
          first: 1
        ) {
          id
          inputTokens { id symbol }
          tick
          totalValueLockedUSD
        }
      }`;

      const headers = config.graph.apiKey ? { Authorization: `Bearer ${config.graph.apiKey}` } : undefined;

      const response = await axios.post(this.subgraphUrl, { query }, { headers });

      if (response.data.errors) {
        this.logger.warn(`GraphQL errors while fetching pool data: ${JSON.stringify(response.data.errors)}`);
      }

      const pools = response.data?.data?.liquidityPools;
      if (!pools || pools.length === 0) {
        throw new Error(`No Uniswap pool found for ${token0}/${token1}`);
      }

      return pools[0];
    } catch (error) {
      this.logger.error(
        `Failed to fetch Uniswap pool data for ${token0}/${token1}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(`Failed to fetch Uniswap pool data for ${token0}/${token1}`);
    }
  }

  /**
   * Gets the current price of a token in terms of another token
   * @param targetToken The target token symbol (e.g., 'ARB')
   * @param baseToken The base token symbol (e.g., 'USDC')
   * @returns The price of the target token in terms of the base token
   */
  async getTokenPrice(targetToken: string, baseToken: string): Promise<number> {
    try {
      const pool: any = await this.getPool(baseToken, targetToken);

      const tick = parseFloat(pool.tick);

      // Uniswap price formula: price = 1.0001^tick
      const price = Math.pow(1.0001, tick);

      // If targetToken corresponds to inputTokens[0], price is token1 per token0 (inverse)
      const targetIsFirst = pool.inputTokens[0].symbol.toUpperCase() === targetToken.toUpperCase();
      return targetIsFirst ? price : 1 / price;
    } catch (error) {
      this.logger.error(`Failed to get price for ${targetToken} in ${baseToken}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to get price for ${targetToken} in ${baseToken}`);
    }
  }

  /**
   * Checks if trading is active for a specific pool
   * @param token0 The first token symbol
   * @param token1 The second token symbol
   * @returns Boolean indicating if trading is active
   */
  async isPoolActive(token0: string, token1: string): Promise<boolean> {
    try {
      const pool: any = await this.getPool(token0, token1);

      // For DEX-AMM schema, liquidity may be stored in totalValueLockedUSD / totalLiquidity fields
      if (pool.liquidity !== undefined) {
        return parseFloat(pool.liquidity) > 0;
      }

      if (pool.totalValueLockedUSD !== undefined) {
        return parseFloat(pool.totalValueLockedUSD) > 500; // consider active if TVL > $500
      }

      // Fallback – consider pool inactive
      return false;
    } catch (error) {
      this.logger.warn(`Failed to check if pool ${token0}/${token1} is active: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Gets the network's current gas price
   * @returns Gas price in gwei
   */
  async getCurrentGasPrice(): Promise<string> {
    try {
      const gasPrice = await this.provider.getGasPrice();
      return ethers.utils.formatUnits(gasPrice, 'gwei');
    } catch (error) {
      this.logger.error(`Failed to get current gas price: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to get current gas price');
    }
  }
} 