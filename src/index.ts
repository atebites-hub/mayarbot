import config from '../config/default';
import { setupLogger } from './utils/logger';
import { MayaService } from './services/maya-service';
import { UniswapService } from './services/uniswap-service';
import { PriceService } from './services/price-service';

/**
 * Maya Protocol Arbitrage Bot - Main Entry Point
 *
 * This bot identifies and executes arbitrage opportunities between 
 * Maya Protocol and Uniswap on Arbitrum.
 */

async function main() {
  const logger = setupLogger();
  
  logger.info('Starting Maya Protocol Arbitrage Bot');
  logger.info(`Configuration: Using ${config.maya.useStageNet ? 'Stagenet' : 'Mainnet'} for Maya Protocol`);
  logger.info(`Target assets: ${config.bot.targetAssets.join(', ')}`);
  logger.info(`Minimum profit threshold: ${config.bot.minProfitThreshold}%`);
  
  try {
    // Initialize services
    const mayaService = new MayaService(logger);
    const uniswapService = new UniswapService(logger);
    const priceService = new PriceService(mayaService, uniswapService, logger);
    
    logger.info('Bot initialized successfully');
    
    // Simple check for arbitrage opportunities
    for (const asset of config.bot.targetAssets) {
      logger.info(`Checking arbitrage opportunity for ${asset}`);
      const opportunity = await priceService.checkArbitrageOpportunity(asset);
      
      if (opportunity) {
        logger.info(`Found arbitrage opportunity for ${asset}:`);
        logger.info(`  Direction: ${opportunity.direction}`);
        logger.info(`  Maya price: ${opportunity.mayaPrice}`);
        logger.info(`  Uniswap price: ${opportunity.uniswapPrice}`);
        logger.info(`  Price difference: ${opportunity.priceDifferencePercent.toFixed(2)}%`);
        logger.info(`  Estimated profit: $${opportunity.estimatedProfit}`);
        
        // TODO: Implement trade execution logic
        logger.info('Trade execution not yet implemented');
      } else {
        logger.info(`No arbitrage opportunity found for ${asset}`);
      }
    }
    
    // In a real bot, we would have a continuous loop here
    logger.info('Bot completed initial check. In a real implementation, this would run continuously.');
    console.log('Maya Protocol Arbitrage Bot completed initial check.');
    
  } catch (error) {
    logger.error(`Failed to run bot: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 