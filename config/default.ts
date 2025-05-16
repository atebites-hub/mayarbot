import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const config = {
  maya: {
    midgardApiUrl: process.env.MAYA_MIDGARD_API_URL || 'https://midgard.mayachain.info/v2',
    nodeApiUrl: process.env.MAYA_NODE_API_URL || 'https://mayanode.mayachain.info/mayachain',
    stagenetMidgardApiUrl:
      process.env.MAYA_STAGENET_MIDGARD_API_URL || 'https://stagenet.midgard.mayachain.info/v2',
    stagenetNodeApiUrl:
      process.env.MAYA_STAGENET_NODE_API_URL || 'https://stagenet.mayanode.mayachain.info/mayachain',
    useStageNet: process.env.USE_STAGENET === 'true',
  },
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    uniswapSubgraphId:
      process.env.UNISWAP_SUBGRAPH_ID || 'FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX',
  },
  vultisig: {
    apiKey: process.env.VULTISIG_API_KEY || '',
    apiSecret: process.env.VULTISIG_API_SECRET || '',
  },
  bot: {
    targetAssets: (
      process.env.TARGET_ASSETS ||
      'ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    ).split(','),
    minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD || '1.5'),
    sleepTimeMs: parseInt(process.env.BOT_SLEEP_TIME_MS || '10000', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs',
  },
  graph: {
    apiKey: process.env.GRAPH_API_KEY || '',
  },
};

export default config; 