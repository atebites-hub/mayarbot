# Maya Protocol Arbitrage Bot

This bot identifies and executes arbitrage opportunities between Maya Protocol and Uniswap on Arbitrum, leveraging price differences for specified assets. It integrates with Vultisig for secure transaction management.

## Overview

The Maya Protocol Arbitrage Bot is designed to:
- Monitor asset prices on Maya Protocol and Uniswap (Arbitrum).
- Identify potential arbitrage opportunities based on configured thresholds.
- Simulate trades, accounting for fees and slippage, to verify profitability.
- Execute profitable arbitrage trades securely using the Vultisig SDK.

**Reference Documents:**
- [Project Requirements](Docs/Project%20Requirements.md)
- [Implementation Plan](Docs/Implementation%20Plan.md)

## Features

- **Data Fetching**:
    - Fetches pool data from Maya Protocol's Midgard API.
    - Fetches pool data from Uniswap V3 on Arbitrum using The Graph.
    - Checks trading status on both platforms.
- **Price Comparison**: Compares prices for configured assets (e.g., ARB, USDC) and identifies potential arbitrage opportunities.
- **Trade Simulation**:
    - Simulates swaps on Maya Protocol using `xchain-mayachain-amm` (estimates output, fees, slippage). (Partially Implemented / In Progress)
    - Simulates swaps on Uniswap V3 using the Uniswap V3 SDK (estimates output, fees, price impact, gas costs). (Partially Implemented / In Progress)
- **Profitability Calculation**: Calculates net profitability after accounting for all transaction fees, gas costs, and potential slippage. (In Progress)
- **Trade Execution**: Executes trades via Vultisig SDK for Maya Protocol and Arbitrum transactions. (Planned)
- **Logging**: Comprehensive logging for all activities, including price checks, simulations, executed trades, and errors.

## Technology Stack

- **Programming Language**: TypeScript with Node.js
- **Key Libraries & SDKs**:
    - `xchain-mayachain-amm`: For simulating swaps on Maya Protocol.
    - `@uniswap/v3-sdk`: For simulating swaps and interacting with Uniswap V3.
    - `ethers.js`: For Ethereum/Arbitrum interactions.
    - `axios`: For HTTP API calls (Midgard, The Graph).
    - `Vultisig SDK`: For secure wallet integration and transaction management. (Integration Planned)
    - `dotenv`: For environment variable management.
    - `winston`: For logging.
- **Testing**: Jest

## Setup

### Prerequisites

- Node.js (v16+ recommended)
- npm (usually comes with Node.js)
- Git

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/mayarbot.git
    cd mayarbot
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Create a `.env` file in the root directory by copying `.env.example` (if available) or creating it from scratch. Populate it with your configuration:
    ```env
    # Maya Protocol Configuration
    MAYA_MIDGARD_API_URL=https://midgard.mayachain.info/v2
    MAYA_NODE_API_URL=https://mayanode.mayachain.info/mayachain
    # For Stagenet (testing)
    MAYA_STAGENET_MIDGARD_API_URL=https://stagenet-midgard.ninerealms.com/v2
    MAYA_STAGENET_NODE_API_URL=https://stagenet-maya.ninerealms.com/mayachain
    USE_STAGENET=true # Set to false for mainnet

    # Uniswap/Arbitrum Configuration
    # Ensure this RPC URL is for the desired network (e.g., Arbitrum Mainnet or Arbitrum Goerli/Sepolia for testing)
    ARBITRUM_RPC_URL=https://arbitrum-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID # Or your testnet RPC
    # The Graph API Key for authenticated access to subgraphs
    GRAPH_API_KEY=your_the_graph_api_key 
    # Subgraph URL for Uniswap V3 on Arbitrum (verify this is current for your target network)
    UNISWAP_SUBGRAPH_URL=https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3-arbitrum-one # Example for Arbitrum One

    # Vultisig Configuration (Details TBD based on SDK integration)
    VULTISIG_API_KEY=your_vultisig_api_key
    # VULTISIG_API_SECRET=your_vultisig_api_secret # If applicable

    # Bot Configuration
    # Comma-separated list of assets to monitor on Maya (e.g., ARB.ARB, ETH.ETH, ETH.USDC-0xStablecoinAddress)
    # For Uniswap, these will be mapped to their Arbitrum equivalents
    TARGET_ASSETS=ARB.ARB,ETH.USDC-0xff970a61a04b1ca14834a43f5de4533ebddb5cc8
    MIN_PROFIT_THRESHOLD=1.0 # Minimum percentage profit to consider a trade (e.g., 1.0 for 1%)
    BOT_SLEEP_TIME_MS=30000 # Time in milliseconds between arbitrage checks
    MAX_SLIPPAGE_PERCENTAGE=0.5 # Maximum allowable slippage for trades

    # Wallet Configuration (Example - adjust based on Vultisig setup)
    # MAYA_WALLET_ADDRESS= # Your MayaChain address managed by Vultisig
    # ARBITRUM_WALLET_ADDRESS= # Your Arbitrum address managed by Vultisig

    # Logging
    LOG_LEVEL=info # e.g., error, warn, info, http, verbose, debug, silly
    LOG_FILE_PATH=./logs
    ```
    **Important**:
    - Obtain a `GRAPH_API_KEY` from [The Graph](https://thegraph.com/studio/) for reliable subgraph access.
    - Verify and update `UNISWAP_SUBGRAPH_URL` for the correct Uniswap V3 subgraph on your target Arbitrum network (mainnet or testnet). The existing URL in the example might be outdated or for a different network.
    - `TARGET_ASSETS` should use Maya's asset notation. The bot will attempt to map these to corresponding Uniswap assets.

## How it Works

The bot operates in a cycle:

1.  **Data Fetching**:
    *   Retrieves pool data (prices, liquidity, trading status) from Maya Protocol via the Midgard API.
    *   Retrieves pool data from Uniswap V3 on Arbitrum via The Graph subgraph.
2.  **Price Comparison**: Calculates and compares asset prices (normalized to a common currency like USDC) on both platforms.
3.  **Trading Status Check**: Verifies that trading is active for the target assets on both Maya Protocol and Uniswap.
4.  **Trade Simulation**:
    *   If a potential price discrepancy is found, it simulates the arbitrage trades:
        *   **Maya Protocol**: Uses `xchain-mayachain-amm` to estimate swap outputs, fees, and slippage.
        *   **Uniswap V3**: Uses the Uniswap V3 SDK to estimate swap outputs, fees, price impact, and Arbitrum gas costs.
5.  **Profitability Calculation**: Determines the net profitability of the potential arbitrage by subtracting all estimated costs (protocol fees, network fees, gas, slippage) from the potential gains.
6.  **Trade Execution**:
    *   If the simulated trade is profitable above the `MIN_PROFIT_THRESHOLD`, the bot will attempt to execute the trades using the Vultisig SDK.
    *   Two main arbitrage flows are considered:
        1.  Asset cheaper on Maya: USDC -> Asset on Maya -> (Bridge if necessary) -> Asset on Uniswap -> USDC on Uniswap.
        2.  Asset cheaper on Uniswap: USDC -> Asset on Uniswap -> (Bridge if necessary) -> Asset on Maya -> USDC on Maya.
    *   (Note: Direct cross-chain swaps via Maya might simplify some flows).

## Usage

### Running the Bot

1.  **Development Mode (with hot-reloading):**
    ```bash
    npm run dev
    ```

2.  **Production Mode:**
    ```bash
    npm run build
    npm start
    ```

### Configuration

Bot behavior is configured through the `.env` file. Key parameters include:
- `TARGET_ASSETS`: Which assets to monitor for arbitrage.
- `MIN_PROFIT_THRESHOLD`: The minimum profit percentage required to trigger a trade.
- `BOT_SLEEP_TIME_MS`: How often the bot checks for opportunities.

## Testing

The project uses Jest for testing.

- **Unit Tests**: Test individual functions and modules (e.g., price calculations, API service components).
- **Integration Tests**: Test interactions between different parts of the system (e.g., data fetching and simulation).
- **Scenario Testing**: (Manual and automated) Involves running the bot against Maya Stagenet and an Arbitrum testnet (e.g., Goerli, Sepolia) to simulate various market conditions and edge cases.

To run tests:
```bash
npm test
```

## Logging and Monitoring

- Logs are managed using Winston.
- Log level and output path are configurable via the `.env` file (`LOG_LEVEL`, `LOG_FILE_PATH`).
- Logs include:
    - Price checks and discovered opportunities.
    - Trade simulation details (inputs, outputs, fees).
    - Trade execution attempts (success/failure, transaction hashes).
    - Errors and critical warnings.

## Project Structure

- `config/`: Application configuration (e.g., constants, non-sensitive settings).
- `src/`: Source code
  - `services/`: Core logic for interacting with Maya, Uniswap, Vultisig, etc.
  - `types/`: TypeScript type definitions and interfaces.
  - `utils/`: Utility functions (e.g., logging, calculations).
  - `core/`: Main bot logic, orchestration.
  - `jobs/`: Background tasks or scheduled operations.
- `tests/`: Unit and integration tests.
- `Docs/`: Project documentation (requirements, implementation plan).
- `logs/`: Directory for log files (ensure it's in `.gitignore` if not already).

## Risk Management & Disclaimer

**Using this arbitrage bot involves significant financial risk. Arbitrage opportunities can be fleeting, and market conditions can change rapidly. Ensure you understand the risks before deploying this bot with real funds.**

Key risks include:
- **Market Risk**: Sudden price movements, volatility.
- **Execution Risk**: Slippage, failed transactions, network congestion.
- **API Risk**: Downtime or changes in Maya Protocol or Uniswap APIs/subgraphs.
- **Smart Contract Risk**: Bugs in underlying protocols.
- **Security Risk**: Secure management of wallet keys/access is paramount.

**This software is provided "as-is" without any warranty. The authors or contributors are not responsible for any financial losses incurred from using this bot.** Always test thoroughly on testnets and start with small amounts of capital if you decide to run it on mainnet.

## Contributing

Contributions are welcome! Please open an issue to discuss any changes or new features you would like to propose. (Further guidelines can be added here).

## License

ISC
