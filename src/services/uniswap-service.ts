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
    this.subgraphUrl = config.arbitrum.uniswapSubgraphUrl;
    
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
      
      // GraphQL query to fetch pool data
      const query = `
        {
          pools(where: {
            token0_: {symbol_contains_nocase: "${token0}"}, 
            token1_: {symbol_contains_nocase: "${token1}"}
            ${feeTier ? `, feeTier: "${feeTier}"` : ''}
          }, orderBy: liquidity, orderDirection: desc, first: 1) {
            id
            token0 {
              id
              symbol
            }
            token1 {
              id
              symbol
            }
            feeTier
            liquidity
            sqrtPrice
            tick
            token0Price
            token1Price
          }
        }
      `;

      const response = await axios.post(
        this.subgraphUrl,
        { query }
      );

      const pools = response.data.data.pools;
      if (!pools || pools.length === 0) {
        throw new Error(`No Uniswap pool found for ${token0}/${token1}`);
      }

      return pools[0];
    } catch (error) {
      this.logger.error(`Failed to fetch Uniswap pool data for ${token0}/${token1}: ${error instanceof Error ? error.message : String(error)}`);
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
      const pool = await this.getPool(baseToken, targetToken);
      
      // Determine which token is which in the pool
      if (pool.token0.symbol.toUpperCase() === targetToken.toUpperCase()) {
        return parseFloat(pool.token1Price);
      } else {
        return parseFloat(pool.token0Price);
      }
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
      const pool = await this.getPool(token0, token1);
      // A pool is considered active if it has liquidity
      return parseInt(pool.liquidity) > 0;
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