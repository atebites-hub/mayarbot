import axios from 'axios';
import config from '../../config/default';
import { MayaPool, MayaInboundAddress } from '../types';
import { Logger } from '../utils/logger';
import { ethers } from 'ethers';

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
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        this.logger.debug(`Fetching pool data for ${asset} (attempt ${attempt + 1})`);
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
      } catch (error: any) {
        if (error.response && error.response.status === 503) {
          attempt += 1;
          this.logger.warn(`Midgard 503 for ${asset}. Retrying (${attempt}/${maxRetries})...`);
          await new Promise((res) => setTimeout(res, 500 * attempt));
          continue;
        }
        this.logger.error(
          `Failed to fetch pool data for ${asset}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw new Error(`Failed to fetch Maya pool data for ${asset}`);
      }
    }
    throw new Error(`Failed to fetch Maya pool data for ${asset} after ${maxRetries} retries`);
  }

  /**
   * Fetches a swap quote from Mayanode
   * @param fromAsset The asset to swap from (e.g., 'ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831')
   * @param toAsset The asset to swap to (e.g., 'MAYA.CACAO')
   * @param amount The amount to swap, in base units of the fromAsset (e.g., 1 ARB USDC = 1000000 if 6 decimals)
   * @returns Swap quote data
   */
  async getSwapQuote(fromAsset: string, toAsset: string, amount: number): Promise<any> {
    const endpoint = `${this.nodeUrl}/quote/swap`;
    const params = {
      from_asset: fromAsset,
      to_asset: toAsset,
      amount: amount.toString(),
      // Optional: streaming_interval, streaming_quantity, tolerance_bps can be added if needed
    };

    try {
      this.logger.debug(`Fetching swap quote from ${fromAsset} to ${toAsset} for amount ${amount}`, params);
      const response = await axios.get(endpoint, { params });
      // The direct response.data is the quote object
      // It includes fields like 'expected_amount_out', 'slippage_bps', 'fees', 'outbound_delay_seconds' etc.
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch swap quote for ${fromAsset} to ${toAsset}: ${error.response?.data?.error || (error instanceof Error ? error.message : String(error))}`
      );
      throw new Error(`Failed to fetch Maya swap quote for ${fromAsset} to ${toAsset}`);
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

  /**
   * Finds a specific asset string from Maya's pool list and extracts its contract address if applicable.
   * @param targetChain The chain of the asset (e.g., 'ARB').
   * @param targetSymbol The symbol of the asset (e.g., 'USDT').
   * @returns An object { mayaAssetString: string, contractAddress: string | null } or null if not found.
   */
  async getMayaAssetDetails(
    targetChain: string,
    targetSymbol: string,
  ): Promise<{ mayaAssetString: string; contractAddress: string | null } | null> {
    this.logger.debug(`Searching for Maya asset details for ${targetChain}.${targetSymbol}`);
    try {
      const pools = await this.getPools(); // Assuming getPools is already implemented and works
      const upperTargetChain = targetChain.toUpperCase();
      const upperTargetSymbol = targetSymbol.toUpperCase();

      for (const pool of pools) {
        const assetParts = pool.asset.split('.');
        if (assetParts.length < 2) continue;

        const chain = assetParts[0];
        const symbolAndContract = assetParts[1];

        if (chain.toUpperCase() === upperTargetChain) {
          const symbolParts = symbolAndContract.split('-');
          const symbol = symbolParts[0];
          
          if (symbol.toUpperCase() === upperTargetSymbol) {
            const contractAddress = symbolParts.length > 1 ? symbolParts[1] : null;
            const mayaAssetString = pool.asset;
            this.logger.info(`Found Maya asset: ${mayaAssetString} for ${targetChain}.${targetSymbol}`);
            return {
              mayaAssetString,
              contractAddress: contractAddress ? ethers.utils.getAddress(contractAddress.toLowerCase()) : null,
            };
          }
        }
      }
      this.logger.warn(`Maya asset ${targetChain}.${targetSymbol} not found in /pools endpoint.`);
      return null;
    } catch (error) {
      this.logger.error(`Error fetching Maya asset details for ${targetChain}.${targetSymbol}: ${error}`);
      return null;
    }
  }
} 