import { MayaService } from './maya-service';
import { UniswapService } from './uniswap-service';
import { ArbitrageOpportunity } from '../types';
import { Logger } from '../utils/logger';
import config from '../../config/default';
import { ethers } from 'ethers';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import { Pool, Route, Trade, FeeAmount } from '@uniswap/v3-sdk';

// Define constants for token symbols and addresses for clarity
// Base asset for arbitrage: Native USDC on Arbitrum, as known by Maya
const USDC_ARB_MAYA_ASSET = 'ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_ARB_CONTRACT_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_SYMBOL = 'USDC';
const USDC_DECIMALS = 6;

// USDT assets will be fetched dynamically
// const USDT_ARB_MAYA_ASSET = 'ARB.USDT-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'; // Example
const USDT_ARB_UNISWAP_SYMBOL = 'USDT';
const USDT_DECIMALS = 6; // Both ETH.USDT and ARB.USDT usually have 6 decimals

const ARBITRUM_ONE_CHAIN_ID = 42161; // For Token constructor

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
    
    this.logger.info('Initialized Price Service (Dynamic USDT_Arb from Maya; USDC_Arb vs USDT_Arb on Uniswap SDK)');
  }

  private getAssetDecimals(symbol: string): number {
    const upper = symbol.toUpperCase();
    if (upper === USDC_SYMBOL) return USDC_DECIMALS;
    if (upper === USDT_ARB_UNISWAP_SYMBOL) return USDT_DECIMALS;
    this.logger.warn(`No specific decimals rule for asset symbol: ${symbol}, defaulting to 6.`);
    return 6;
  }

  /**
   * Checks for arbitrage opportunities.
   * Compares price of USDC on Arbitrum (USDC_ARB_MAYA_ASSET) against USDT.
   * On Maya: USDC_ARB_MAYA_ASSET vs USDT_ARB_MAYA_ASSET
   * On Uniswap: USDC_ARB_UNISWAP_SYMBOL vs USDT_ARB_UNISWAP_SYMBOL
   * @param configuredMayaAssetPair The Maya asset string from config, should be USDC_ARB_MAYA_ASSET.
   * @returns Arbitrage opportunity data if one exists, null otherwise
   */
  async checkArbitrageOpportunity(
    configuredMayaAssetPair: string 
  ): Promise<ArbitrageOpportunity | null> {
    if (configuredMayaAssetPair !== USDC_ARB_MAYA_ASSET) {
      this.logger.warn(`PriceService is expecting ${USDC_ARB_MAYA_ASSET} as target, but received ${configuredMayaAssetPair}. Skipping.`);
      return null;
    }

    // Dynamically fetch USDT details from Maya for ARB chain
    const usdtMayaDetails = await this.mayaService.getMayaAssetDetails('ARB', 'USDT');
    if (!usdtMayaDetails || !usdtMayaDetails.contractAddress) {
      this.logger.error('Could not dynamically fetch ARB.USDT details or contract address from Maya. Cannot proceed.');
      return null;
    }
    const USDT_ARB_MAYA_ASSET = usdtMayaDetails.mayaAssetString;
    const USDT_ARB_CONTRACT_ADDRESS = usdtMayaDetails.contractAddress; // Checksummed by MayaService

    this.logger.info(`Using ARB.USDC on Maya: ${USDC_ARB_MAYA_ASSET}`);
    this.logger.info(`Dynamically determined ARB.USDT on Maya: ${USDT_ARB_MAYA_ASSET} (Contract: ${USDT_ARB_CONTRACT_ADDRESS})`);

    const baseAssetMaya = USDC_ARB_MAYA_ASSET;         
    const quoteAssetMayaOnMaya = USDT_ARB_MAYA_ASSET;       
    
    // For Uniswap, we use the known symbols and the dynamically confirmed USDT address
    const usdcTokenUniswap = this.uniswapService.getToken(USDC_SYMBOL); // Uses internal map for USDC
    const usdtTokenUniswap = new Token( // Construct USDT Token with dynamically fetched address
        ARBITRUM_ONE_CHAIN_ID, 
        USDT_ARB_CONTRACT_ADDRESS, 
        USDT_DECIMALS, 
        USDT_ARB_UNISWAP_SYMBOL, 
        'Tether USD (Arbitrum)'
    );

    // Amount of USDC_ARB to test with (e.g., 1 USDC)
    const amountToTradeUsdcFloat = 1; // Trade 1 USDC
    const amountToTradeUsdcBaseUnits = ethers.utils.parseUnits(amountToTradeUsdcFloat.toString(), USDC_DECIMALS).toString();

    try {
      // 1. Get Maya Price: How much USDT_ARB_MAYA_ASSET for amountToTradeUsdcBaseUnits of USDC_ARB_MAYA_ASSET
      let mayaUsdcPriceInUsdt = 0;

      // Check if ARB chain is halted on Maya
      const isArbChainHaltedOnMaya = await this.mayaService.isChainHalted('ARB');
      if (isArbChainHaltedOnMaya) {
        this.logger.warn('Arbitrum chain is reported as HALTED on Maya. Using pegged 1:1 USDC/USDT price for Maya side.');
        mayaUsdcPriceInUsdt = 1.0;
      } else {
        try {
          this.logger.info(`Quoting Maya: ${amountToTradeUsdcFloat} ${baseAssetMaya} -> ${quoteAssetMayaOnMaya}`);
          const mayaQuote = await this.mayaService.getSwapQuote(
            baseAssetMaya,
            quoteAssetMayaOnMaya,
            parseFloat(amountToTradeUsdcBaseUnits) 
          );

          if (mayaQuote.error || !mayaQuote.expected_amount_out || mayaQuote.expected_amount_out === '0') {
              this.logger.warn(`Maya quote for ${baseAssetMaya} -> ${quoteAssetMayaOnMaya} failed or is zero/problematic: ${JSON.stringify(mayaQuote)}`);
              // If quote fails even if chain not halted, we might not get a price.
              // Set to 0 to indicate failure to get a real quote.
              mayaUsdcPriceInUsdt = 0;
          } else {
              const mayaAmountOutUsdt = ethers.BigNumber.from(mayaQuote.expected_amount_out);
              mayaUsdcPriceInUsdt = parseFloat(ethers.utils.formatUnits(mayaAmountOutUsdt, this.getAssetDecimals(USDT_ARB_UNISWAP_SYMBOL))) / amountToTradeUsdcFloat;
              this.logger.info(`Maya: ${amountToTradeUsdcFloat} ${baseAssetMaya} = ${parseFloat(ethers.utils.formatUnits(mayaAmountOutUsdt, this.getAssetDecimals(USDT_ARB_UNISWAP_SYMBOL)))} ${quoteAssetMayaOnMaya}. Price: 1 ${baseAssetMaya} = ${mayaUsdcPriceInUsdt.toFixed(USDT_DECIMALS)} ${quoteAssetMayaOnMaya}`);
          }
        } catch (e: any) {
          this.logger.warn(`Could not get Maya quote for ${baseAssetMaya} -> ${quoteAssetMayaOnMaya}: ${e.message}`);
          // Set to 0 to indicate failure to get a real quote.
          mayaUsdcPriceInUsdt = 0; 
        }
      }

      // 2. Get Uniswap Price: How much USDT_ARB_UNISWAP_SYMBOL for amountToTradeUsdcBaseUnits of USDC_ARB_UNISWAP_SYMBOL
      let uniswapUsdcPriceInUsdt = 0;
      let uniswapTrade: Trade<Token, Token, TradeType.EXACT_INPUT> | null = null;

      try {
        this.logger.info(
          `Quoting Uniswap: ${amountToTradeUsdcFloat} ${usdcTokenUniswap.symbol} -> ${usdtTokenUniswap.symbol}`,
        );
        uniswapTrade = await this.uniswapService.getBestV3TradeExactIn(
          usdcTokenUniswap,
          usdtTokenUniswap,
          amountToTradeUsdcBaseUnits,
        );

        if (uniswapTrade) {
          const uniswapAmountOutUsdtBaseUnits = ethers.utils.parseUnits(uniswapTrade.outputAmount.toSignificant(USDT_DECIMALS), USDT_DECIMALS);
          uniswapUsdcPriceInUsdt = parseFloat(ethers.utils.formatUnits(uniswapAmountOutUsdtBaseUnits, USDT_DECIMALS)) / amountToTradeUsdcFloat;
          this.logger.info(`Uniswap: ${amountToTradeUsdcFloat} ${usdcTokenUniswap.symbol} = ${uniswapTrade.outputAmount.toSignificant(USDT_DECIMALS)} ${usdtTokenUniswap.symbol}. Price: 1 ${usdcTokenUniswap.symbol} = ${uniswapUsdcPriceInUsdt.toFixed(USDT_DECIMALS)} ${usdtTokenUniswap.symbol}`);
        } else {
          this.logger.warn('Uniswap trade object was null (no valid route found by SDK).');
        }
      } catch (e: any) {
        this.logger.warn(`Could not get Uniswap quote for ${USDC_SYMBOL} -> ${USDT_ARB_UNISWAP_SYMBOL}: ${e.message}`);
      }

      if (mayaUsdcPriceInUsdt === 0 || uniswapUsdcPriceInUsdt === 0) {
        this.logger.warn('Could not obtain a valid (non-zero) price from both Maya and Uniswap for USDC/USDT.');
        return null;
      }
      
      const priceDifferencePercent = this.calculatePriceDifference(mayaUsdcPriceInUsdt, uniswapUsdcPriceInUsdt);
      
      this.logger.info(`USDC/USDT Price (USDT per 1 USDC): Maya=${mayaUsdcPriceInUsdt.toFixed(USDT_DECIMALS)}, Uniswap=${uniswapUsdcPriceInUsdt.toFixed(USDT_DECIMALS)}, Difference=${priceDifferencePercent.toFixed(2)}%`);
      
      if (Math.abs(priceDifferencePercent) >= config.bot.minProfitThreshold) {
        const direction: 'MAYA_TO_UNISWAP' | 'UNISWAP_TO_MAYA' = 
          mayaUsdcPriceInUsdt < uniswapUsdcPriceInUsdt ? 'MAYA_TO_UNISWAP' : 'UNISWAP_TO_MAYA';
        
        const profitInUsdt = (Math.abs(uniswapUsdcPriceInUsdt - mayaUsdcPriceInUsdt)) * amountToTradeUsdcFloat;

        this.logger.info(`Arbitrage opportunity DETECTED for ${USDC_SYMBOL}/${USDT_ARB_UNISWAP_SYMBOL}: Direction ${direction}, Diff: ${priceDifferencePercent.toFixed(2)}%`);
        return {
          targetAsset: USDC_SYMBOL, 
          stablecoin: USDT_ARB_UNISWAP_SYMBOL, 
          mayaPrice: mayaUsdcPriceInUsdt,
          uniswapPrice: uniswapUsdcPriceInUsdt,
          priceDifferencePercent,
          estimatedProfit: parseFloat(profitInUsdt.toFixed(USDT_DECIMALS)),
          direction,
          simulation: { 
            inputAmount: amountToTradeUsdcBaseUnits,
            outputAmount: uniswapTrade // Store the actual trade object or its output if available
              ? ethers.utils.parseUnits(uniswapTrade.outputAmount.toSignificant(USDT_DECIMALS), USDT_DECIMALS).toString()
              : '0',
            inputToken: USDC_SYMBOL,
            outputToken: USDT_ARB_UNISWAP_SYMBOL,
            executionFee: '0',
            slippage: 0,
            priceImpact: 0, // TODO: Get from trade object if possible
            profitable: true,
            profitPercentage: Math.abs(priceDifferencePercent),
            profitAmount: profitInUsdt.toFixed(USDT_DECIMALS),
          },
          timestamp: Date.now(),
        };
      }
      
      this.logger.info(`No significant arbitrage opportunity found for USDC/USDT. Difference: ${priceDifferencePercent.toFixed(2)}%`);
      return null;
    } catch (error) {
      this.logger.error(`Error in checkArbitrageOpportunity for USDC/USDT: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private calculatePriceDifference(price1: number, price2: number): number {
    if (price2 === 0) return price1 === 0 ? 0 : Infinity; 
    return ((price1 - price2) / price2) * 100;
  }

  private getChainFromMayaAsset(mayaAsset: string): string {
    return mayaAsset.split('.')[0];
  }
} 