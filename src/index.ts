import config from '../config/default';
import { setupLogger, Logger } from './utils/logger';
import { MayaService } from './services/maya-service';
import { UniswapService } from './services/uniswap-service';
import { PriceService } from './services/price-service';

/**
 * Maya Protocol Arbitrage Bot - Main Entry Point
 *
 * This bot identifies and executes arbitrage opportunities between 
 * Maya Protocol and Uniswap on Arbitrum.
 */

// Global flag to control the main loop for graceful shutdown
let keepRunning = true;

async function main() {
  let logger: Logger | null = null;
  let uniswapServiceInstance: UniswapService | null = null;
  
  // Graceful shutdown handler
  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down from SIGINT (Ctrl+C)...');
    if (logger) {
      logger.info('SIGINT received. Shutting down gracefully...');
    }
    keepRunning = false; // Signal the main loop to stop

    if (uniswapServiceInstance) {
      uniswapServiceInstance.stopBackgroundTickUpdater();
    }
    
    // Add a small delay to allow async operations like logging or stopping services to attempt completion
    // In a more complex app, you might have promises to await here.
    setTimeout(() => {
        if (logger) logger.info('Shutdown complete.');
        process.exit(0);
    }, 1000); 
  });

  try {
    logger = setupLogger();
    
    logger.info('Starting Maya Protocol Arbitrage Bot');
    logger.info(`Configuration: Using ${config.maya.useStageNet ? 'Stagenet' : 'Mainnet'} for Maya Protocol`);
    logger.info(`Target assets: ${config.bot.targetAssets.join(', ')}`);
    logger.info(`Minimum profit threshold: ${config.bot.minProfitThreshold}%`);
    
    const mayaService = new MayaService(logger);
    uniswapServiceInstance = new UniswapService(logger);
    const priceService = new PriceService(mayaService, uniswapServiceInstance, logger);
    
    uniswapServiceInstance.startBackgroundTickUpdater();
    
    logger.info('Bot initialized successfully. Starting main loop...');
    
    while(keepRunning) {
        logger.info(`New arbitrage check cycle starting at ${new Date().toISOString()}`);
        try {
            const opportunity = await priceService.checkArbitrageOpportunity(
                config.bot.targetAssets[0], // Assuming first target asset for now
            );
            
            if (opportunity) {
                logger.info(
                    `Arbitrage opportunity found for ${opportunity.targetAsset}/${opportunity.stablecoin}!`,
                );
                logger.info(`  Direction: ${opportunity.direction}`);
                logger.info(`  Estimated Profit: ${opportunity.estimatedProfit.toFixed(6)} ${opportunity.stablecoin} (${opportunity.priceDifferencePercent.toFixed(2)}%)`);
                logger.info(`  Maya Price: ${opportunity.mayaPrice.toFixed(6)}`);
                logger.info(`  Uniswap Price: ${opportunity.uniswapPrice.toFixed(6)}`);
                // In a real bot, you would proceed to execute the trade here
            } else {
                logger.info(
                    `No arbitrage opportunity found for ${config.bot.targetAssets[0]}.`,
                );
            }
        } catch (cycleError) {
            logger.error('Error during arbitrage check cycle:', cycleError);
            // Continue to next iteration after a delay, even if one cycle fails
        }

        if (!keepRunning) break; // Exit loop if shutdown initiated

        logger.info(`Arbitrage check cycle complete. Sleeping for ${config.bot.sleepTimeMs / 1000}s...`);
        // Use a promise that can be broken by the AbortController if needed, or just simple timeout for now.
        // For a simple sleep that respects keepRunning:
        const sleepUntil = Date.now() + config.bot.sleepTimeMs;
        while (Date.now() < sleepUntil && keepRunning) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Check keepRunning periodically
        }
        if (!keepRunning) break; // Exit loop if shutdown initiated during sleep
    }

  } catch (error) {
    if (logger) {
      logger.error('Critical error in main bot execution:', error);
    } else {
      console.error('Critical error in main bot execution (logger not initialized):', error);
    }
    keepRunning = false; // Ensure loop terminates on outer catch too
  } finally {
    if (logger) {
      logger.info('Bot shutting down / main loop ended.');
    }
    if (uniswapServiceInstance) {
      // This might be redundant if SIGINT handler already called it, but good for other exit paths.
      uniswapServiceInstance.stopBackgroundTickUpdater(); 
    }
    if (logger) {
        logger.info('Bot shutdown procedures complete.');
    } else {
        console.log('Bot shutdown procedures complete (logger not initialized).');
    }
  }
}

main().catch((error) => {
  console.error('Unhandled error in main execution call:', error);
  process.exit(1); 
}); 