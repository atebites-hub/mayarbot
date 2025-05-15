import axios from 'axios';
import config from '../../config/default';
import { MayaPool, MayaInboundAddress } from '../types';
import { Logger } from '../utils/logger';

/**
 * Service class for interacting with the Maya Protocol APIs
 */
export class MayaService {
  private readonly midgardUrl: string;
  private readonly nodeUrl: string;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    // Use stagenet or mainnet URLs based on configuration
    this.midgardUrl = config.maya.useStageNet 
      ? config.maya.stagenetMidgardApiUrl
      : config.maya.midgardApiUrl;
      
    this.nodeUrl = config.maya.useStageNet
      ? config.maya.stagenetNodeApiUrl
      : config.maya.nodeApiUrl;
      
    this.logger.info(`Initialized Maya Service with Midgard URL: ${this.midgardUrl}`);
    this.logger.info(`Initialized Maya Service with Node URL: ${this.nodeUrl}`);
  }

  /**
   * Fetches data for a specific pool from Midgard API
   * @param asset The asset symbol (e.g., 'ARB.ARB')
   * @returns Pool data
   */
  async getPool(asset: string): Promise<MayaPool> {
    try {
      this.logger.debug(`Fetching pool data for ${asset}`);
      const response = await axios.get(`${this.midgardUrl}/pool/${asset}`);
      
      // Parse and convert relevant data
      const poolData = response.data;
      const cacaoPrice = await this.getCacaoUsdPrice();
      
      // Calculate asset price in USD by multiplying the asset price in CACAO with the CACAO/USD price
      const assetPriceUSD = parseFloat(poolData.assetPrice) * cacaoPrice;
      
      return {
        ...poolData,
        assetPriceUSD,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch pool data for ${asset}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to fetch Maya pool data for ${asset}`);
    }
  }

  /**
   * Fetches all pools from Midgard API
   * @returns Array of pool data
   */
  async getPools(): Promise<MayaPool[]> {
    try {
      this.logger.debug('Fetching all pools');
      const response = await axios.get(`${this.midgardUrl}/pools`);
      
      const cacaoPrice = await this.getCacaoUsdPrice();
      
      // Add USD price calculation to each pool
      return response.data.map((pool: any) => ({
        ...pool,
        assetPriceUSD: parseFloat(pool.assetPrice) * cacaoPrice,
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch pools: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to fetch Maya pools');
    }
  }

  /**
   * Checks if trading is halted for a particular chain
   * @param chain The chain to check (e.g., 'ARB')
   * @returns Boolean indicating if trading is halted
   */
  async isChainHalted(chain: string): Promise<boolean> {
    try {
      this.logger.debug(`Checking if trading is halted for chain ${chain}`);
      const inboundAddresses = await this.getInboundAddresses();
      
      const chainAddress = inboundAddresses.find((addr) => addr.chain === chain);
      if (!chainAddress) {
        this.logger.warn(`Chain ${chain} not found in inbound addresses`);
        return true; // Consider it halted if not found
      }
      
      return chainAddress.halted;
    } catch (error) {
      this.logger.error(`Failed to check if chain ${chain} is halted: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to check if chain ${chain} is halted`);
    }
  }

  /**
   * Fetches inbound addresses from the Maya node
   * @returns Array of inbound addresses
   */
  async getInboundAddresses(): Promise<MayaInboundAddress[]> {
    try {
      this.logger.debug('Fetching inbound addresses');
      const response = await axios.get(`${this.nodeUrl}/inbound_addresses`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch inbound addresses: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Failed to fetch Maya inbound addresses');
    }
  }

  /**
   * Gets the current CACAO/USD price
   * This is a placeholder - in a real implementation, you'd fetch from a reliable source or calculate it
   * @returns The current CACAO/USD price
   */
  async getCacaoUsdPrice(): Promise<number> {
    // In a real implementation, you would fetch this from a price oracle or calculate it
    // For this example, we're using a placeholder value
    // TODO: Implement real CACAO/USD price fetching
    return 0.05; // Placeholder value
  }
} 