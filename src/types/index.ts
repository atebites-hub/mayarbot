/**
 * Types for Maya Protocol
 */
export interface MayaPool {
  asset: string;
  assetDepth: string;
  cacaoDepth: string;
  assetPrice: string;
  assetPriceUSD: number;
  status: string;
  units: string;
  volume24h: string;
}

export interface MayaInboundAddress {
  chain: string;
  pub_key: string;
  address: string;
  halted: boolean;
  gas_rate: string;
}

/**
 * Types for Uniswap
 */
export interface UniswapPool {
  id: string;
  token0: {
    id: string;
    symbol: string;
  };
  token1: {
    id: string;
    symbol: string;
  };
  feeTier: string;
  liquidity: string;
  sqrtPrice: string;
  tick: string;
  token0Price: string;
  token1Price: string;
}

/**
 * Types for trade simulation and execution
 */
export interface TradeSimulation {
  inputAmount: string;
  outputAmount: string;
  inputToken: string;
  outputToken: string;
  executionFee: string;
  slippage: number;
  priceImpact: number;
  profitable: boolean;
  profitAmount?: string;
  profitPercentage?: number;
  gasCost?: string;
}

export interface ArbitrageOpportunity {
  targetAsset: string;
  stablecoin: string;
  mayaPrice: number;
  uniswapPrice: number;
  priceDifferencePercent: number;
  estimatedProfit: number;
  direction: 'MAYA_TO_UNISWAP' | 'UNISWAP_TO_MAYA';
  simulation: TradeSimulation;
  timestamp: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  chainId: number;
  gasPrice?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
} 