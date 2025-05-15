# Maya Protocol Arbitrage Bot

This bot identifies and executes arbitrage opportunities between Maya Protocol and Uniswap on Arbitrum.

## Features

- Fetches pool data from Maya Protocol's Midgard API
- Fetches pool data from Uniswap V3 on Arbitrum using The Graph
- Compares prices and identifies arbitrage opportunities
- Simulates trades to verify profitability (coming soon)
- Executes trades via Vultisig SDK (coming soon)

## Setup

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/mayarbot.git
cd mayarbot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
# Maya Protocol Configuration
MAYA_MIDGARD_API_URL=https://midgard.mayachain.info/v2
MAYA_NODE_API_URL=https://mayanode.mayachain.info/mayachain
MAYA_STAGENET_MIDGARD_API_URL=https://stagenet-midgard.ninerealms.com/v2
MAYA_STAGENET_NODE_API_URL=https://stagenet-maya.ninerealms.com/mayachain
USE_STAGENET=true

# Uniswap/Arbitrum Configuration
ARBITRUM_RPC_URL=https://arbitrum-goerli.publicnode.com
UNISWAP_SUBGRAPH_URL=https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-arbitrum-goerli

# Vultisig Configuration
VULTISIG_API_KEY=your_vultisig_api_key
VULTISIG_API_SECRET=your_vultisig_api_secret

# Bot Configuration
TARGET_ASSETS=ARB,USDC
MIN_PROFIT_THRESHOLD=1.5
BOT_SLEEP_TIME_MS=10000

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs
```

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Testing

```bash
npm test
```

## Project Structure

- `config/`: Configuration files
- `src/`: Source code
  - `services/`: Service classes for Maya Protocol, Uniswap, etc.
  - `types/`: TypeScript type definitions
  - `utils/`: Utility functions
- `tests/`: Test files

## License

ISC
