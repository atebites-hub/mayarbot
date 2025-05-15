import { MayaService } from './maya-service';
import { UniswapService } from './uniswap-service';
import { ArbitrageOpportunity } from '../types';
import { Logger } from '../utils/logger';
import config from '../../config/default';

/**
 * Service for comparing prices between Maya Protocol and Uniswap
 */
export class PriceService {
  private readonly mayaService: MayaService;
  private readonly uniswapService: UniswapService;
  private readonly logger: Logger;

  constructor(mayaService: MayaService, uniswapService: UniswapService, logger: Logger) {
    this.mayaService = mayaService;
    this.uniswapService = uniswapService;
    this.logger = logger;
    
    this.logger.info('Initialized Price Service');
  }

  /**
   * Checks for arbitrage opportunities between Maya Protocol and Uniswap
   * @param targetAsset The target asset to check for arbitrage (e.g., 'ARB')
   * @param stablecoin The stablecoin to use as a base (e.g., 'USDC')
   * @returns Arbitrage opportunity data if one exists, null otherwise
   */
  async checkArbitrageOpportunity(
    targetAsset: string,
    stablecoin = 'USDC'
  ): Promise<ArbitrageOpportunity | null> {
    try {
      this.logger.info(`Checking arbitrage opportunity for ${targetAsset} using ${stablecoin}`);
      
      // Check if trading is active on both platforms
      const mayaChain = this.getChainFromAsset(targetAsset);
      const isMayaActive = !(await this.mayaService.isChainHalted(mayaChain));
      const isUniswapActive = await this.uniswapService.isPoolActive(targetAsset, stablecoin);
      
      if (!isMayaActive || !isUniswapActive) {
        this.logger.warn(`Trading not active: Maya=${isMayaActive}, Uniswap=${isUniswapActive}`);
        return null;
      }
      
      // Get prices from both platforms
      const mayaPool = await this.mayaService.getPool(`${mayaChain}.${targetAsset}`);
      const uniswapPrice = await this.uniswapService.getTokenPrice(targetAsset, stablecoin);
      
      const mayaPrice = mayaPool.assetPriceUSD;
      
      // Calculate the price difference as a percentage
      const priceDifferencePercent = this.calculatePriceDifference(mayaPrice, uniswapPrice);
      
      this.logger.info(`Price comparison: Maya=${mayaPrice}, Uniswap=${uniswapPrice}, Difference=${priceDifferencePercent.toFixed(2)}%`);
      
      // Check if the price difference exceeds the minimum threshold for arbitrage
      if (Math.abs(priceDifferencePercent) >= config.bot.minProfitThreshold) {
        const direction = mayaPrice < uniswapPrice ? 'MAYA_TO_UNISWAP' : 'UNISWAP_TO_MAYA';
        
        // Simplified placeholder for now - in a real implementation we'd do actual simulation
        // This will be replaced when we implement the simulation services
        const placeholderSimulation = {
          inputAmount: '1000',
          outputAmount: '1050',
          inputToken: stablecoin,
          outputToken: targetAsset,
          executionFee: '10',
          slippage: 0.5,
          priceImpact: 0.3,
          profitable: true,
          profitPercentage: Math.abs(priceDifferencePercent),
          profitAmount: (1000 * Math.abs(priceDifferencePercent) / 100).toFixed(2),
        };
        
        return {
          targetAsset,
          stablecoin,
          mayaPrice,
          uniswapPrice,
          priceDifferencePercent,
          estimatedProfit: parseFloat(placeholderSimulation.profitAmount || '0'),
          direction,
          simulation: placeholderSimulation,
          timestamp: Date.now(),
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking arbitrage opportunity: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Calculates the percentage difference between two prices
   * @param price1 First price
   * @param price2 Second price
   * @returns Percentage difference
   */
  private calculatePriceDifference(price1: number, price2: number): number {
    // Calculate percentage difference with price2 as the reference
    return ((price1 - price2) / price2) * 100;
  }

  /**
   * Extracts the chain from a full asset name
   * @param asset Asset name (e.g., 'ARB' extracts to 'ARB')
   * @returns Chain name
   */
  private getChainFromAsset(asset: string): string {
    const map: Record<string, string> = {
      // Maya chain symbols
      ARB: 'ARB',
      USDC: 'ETH', // USDC.e is an ERC-20 on Ethereum side
      'USDC.E': 'ETH',
    };

    return map[asset.toUpperCase()] || asset;
  }
} 