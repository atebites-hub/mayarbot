# Maya Protocol Arbitrage Bot: Planning Document

## 1. Background and Motivation

The primary goal of this project is to develop an automated arbitrage bot that identifies and executes profitable trading opportunities between Maya Protocol and Uniswap on the Arbitrum network. The bot aims to leverage price discrepancies for shared assets across these two platforms.

This initiative is based on the potential for arbitrage due to market inefficiencies and the distinct features of Maya Protocol (cross-chain native swaps) and Uniswap V3 (concentrated liquidity on Arbitrum).

**Reference Documents:**
*   Project Requirements: `Docs/Project Requirements.md`
*   Implementation Plan Overview: `Docs/Implementation Plan.md`

The bot will be developed using TypeScript/Node.js and will integrate with:
*   **Vultisig SDK**: For secure, programmatic wallet operations (Maya & Arbitrum transactions).
*   **Maya Protocol**:
    *   Midgard API: For pool data, prices, and depths.
    *   `mayanode.mayachain.info/mayachain/inbound_addresses`: For checking trading status and inbound THORNode details.
    *   `xchain-mayachain-amm`: For simulating swaps on Maya Protocol.
*   **Uniswap V3 (Arbitrum)**:
    *   The Graph Subgraph: For fetching pool data, prices, and liquidity.
    *   Uniswap V3 SDK: For simulating swaps and calculating price impact.

The core logic involves:
1.  Fetching and comparing asset prices on Maya and Uniswap.
2.  Verifying that trading is active on both platforms for the target asset.
3.  Simulating trades (including fees, slippage, and gas costs) to confirm profitability.
4.  Executing trades if the simulation indicates a net profit, using one of two flows:
    *   If asset price is lower on Maya: USDC -> Asset on Maya -> USDC on Uniswap.
    *   If asset price is higher on Maya: USDC -> Asset on Uniswap -> USDC on Maya.

## 2. Key Challenges and Analysis

*   **SDK and API Integration**: Managing asynchronous operations and potential inconsistencies across Vultisig SDK, `xchain-mayachain-amm`, Uniswap V3 SDK, Midgard API, and Uniswap Subgraph.
*   **Real-time Data Synchronization**: Ensuring price and status data from Maya and Uniswap are fetched with minimal latency to act on fleeting arbitrage opportunities.
*   **Transaction Costs and Slippage**: Accurately modeling and minimizing Maya Protocol fees, Uniswap V3 fees, Arbitrum gas costs, and price slippage in both simulation and execution.
*   **Execution Speed**: Optimizing the trade execution pipeline to submit transactions quickly once an opportunity is identified.
*   **Security**: Securely managing Vultisig wallet interactions, API keys, and protecting the bot from external threats.
*   **Robust Error Handling**: Implementing comprehensive error handling for API downtimes, network issues, failed transactions, and unexpected market conditions.
*   **Accurate Simulation**: Ensuring trade simulations precisely reflect real-world outcomes, including all fees and slippage, to avoid loss-making trades.
*   **Stagenet/Testnet Limitations**: Stagenet (Maya) and testnet (Arbitrum) environments may have different liquidity profiles and conditions compared to mainnet, requiring careful transition.
*   **Smart Contract Interactions**: Ensuring correct interaction with Maya Protocol's and Uniswap's smart contracts, especially regarding memos for Maya swaps.

## 3. High-level Task Breakdown

**Phase 1: Setup and Foundation**

1.  **Task 1.1: Project Setup & Environment Configuration**
    *   Description: Initialize a new TypeScript/Node.js project. Install core dependencies: Vultisig SDK, `xchain-mayachain-amm`, `@uniswap/v3-sdk`, `ethers.js` (for Uniswap SDK and Arbitrum interaction), `axios` (for API calls). Set up ESLint, Prettier, and a basic project structure (`src`, `tests`, `config`).
    *   Success Criteria: Project compiles. A basic script (e.g., `console.log("Hello Arbitrage Bot")`) runs successfully. `tsconfig.json` and `package.json` are configured.

2.  **Task 1.2: Vultisig Wallet Integration - Setup and Basic Read Operations**
    *   Description: Integrate the Vultisig SDK. Implement functions to connect to a configured Vultisig wallet. Implement functions to query balances for CACAO (Maya) and ETH/USDC (Arbitrum) on their respective testnets/stagenets.
    *   Success Criteria: Able to programmatically connect to Vultisig and retrieve and display balances for the specified assets from Maya Stagenet and Arbitrum Testnet.

3.  **Task 1.3: Configuration Management**
    *   Description: Implement a secure system for managing application configurations (e.g., API endpoints, asset pairs like ARB/USDC, wallet identifiers, private keys/seed phrases for Vultisig if used directly by the bot - **needs careful security consideration**). Use environment variables (`dotenv` package) or a dedicated config file.
    *   Success Criteria: Configurations are loaded securely and are easily accessible throughout the application. Sensitive data is not hardcoded.

**Phase 2: Data Fetching and Price Discovery**

4.  **Task 2.1: Maya Protocol Data Fetching - Pool Data & Trading Status**
    *   Description:
        *   Implement functions to fetch pool details (e.g., for `MAYA.CACAO`, `ARB.ARB`, `ETH.USDC`) from the Midgard API (stagenet). Extract asset depths, CACAO depths, and calculate asset prices in CACAO.
        *   Implement functions to fetch data from `MAYANode/mayachain/inbound_addresses` to check if trading is halted for specific chains/assets.
    *   Success Criteria: Able to fetch and parse pool data (depths, status, price in CACAO) for specified assets on Maya Stagenet. Able to determine if trading for a given asset (e.g., ARB) is active or halted.

5.  **Task 2.2: Uniswap (Arbitrum) Data Fetching - Pool Data & Price**
    *   Description:
        *   Set up to query the Uniswap V3 Subgraph on Arbitrum (testnet) for relevant pools (e.g., ARB/USDC).
        *   Implement functions to fetch pool liquidity, tick data, and calculate current prices for specified pairs using the Uniswap V3 SDK or direct subgraph queries.
    *   Success Criteria: Able to fetch and parse pool data (liquidity, current tick, price) for specified asset pairs on Uniswap V3 (Arbitrum Goerli/Sepolia testnet).

6.  **Task 2.3: Price Calculation and Normalization**
    *   Description: Develop logic to convert Maya asset prices (initially in CACAO) to a common stablecoin (e.g., USDC) by fetching CACAO/USDC price from Maya or a reliable external oracle. Normalize Uniswap prices to USDC. Ensure prices are comparable.
    *   Success Criteria: Price calculation logic correctly derives comparable USDC prices for a target asset (e.g., ARB) from both Maya Protocol and Uniswap.

**Phase 3: Trade Simulation**

7.  **Task 3.1: Maya Protocol Swap Simulation (`xchain-mayachain-amm`)**
    *   Description: Integrate `xchain-mayachain-amm` for Maya Protocol. Implement a function to simulate a swap (e.g., USDC to TARGET_ASSET and TARGET_ASSET to USDC). The simulation must estimate output amount, considering protocol fees and slippage.
    *   Success Criteria: Able to reliably simulate swaps on Maya Stagenet using `xchain-mayachain-amm` and get estimated output, fees, and slippage for a given input amount.

8.  **Task 3.2: Uniswap V3 Swap Simulation (Uniswap V3 SDK)**
    *   Description: Integrate the Uniswap V3 SDK. Implement a function to simulate a swap on Arbitrum testnet (e.g., USDC to TARGET_ASSET and TARGET_ASSET to USDC). The simulation must estimate output amount, considering pool fees, price impact (slippage), and estimated gas costs for an Arbitrum transaction.
    *   Success Criteria: Able to reliably simulate swaps on Uniswap V3 (Arbitrum testnet) using the SDK and get estimated output, fees, price impact, and gas cost.

9.  **Task 3.3: Arbitrage Profitability Calculation**
    *   Description: Combine the simulation results. Develop the core logic to:
        *   Evaluate the flow: USDC (Arbitrum) -> TARGET_ASSET (Uniswap) -> Transfer to Maya (if needed) -> TARGET_ASSET (Maya) -> USDC (Maya).
        *   Evaluate the flow: USDC (Maya) -> TARGET_ASSET (Maya) -> Transfer to Arbitrum (if needed) -> TARGET_ASSET (Uniswap) -> USDC (Arbitrum).
        *   Calculate net profit after all identified costs (Maya fees, Uniswap fees, Arbitrum gas, potential cross-chain transfer fees if not direct swaps).
    *   Success Criteria: Profitability calculation correctly identifies potentially profitable arbitrage scenarios by comparing the net USDC out vs USDC in for both flows, after accounting for all known costs.

**Phase 4: Trade Execution (using Vultisig)**

10. **Task 4.1: Maya Protocol Trade Execution**
    *   Description: Implement functions using the Vultisig SDK to construct and send a transaction to Maya Protocol for a swap. This includes correctly formatting the memo (e.g., `SWAP:ASSET:DEST_ADDR:LIMIT`).
    *   Success Criteria: Able to programmatically execute a swap transaction (e.g., USDC to ARB) on Maya Stagenet using Vultisig. The transaction is confirmed on-chain, and assets are received.

11. **Task 4.2: Uniswap V3 Trade Execution**
    *   Description: Implement functions using the Vultisig SDK (if it supports direct contract interaction on Arbitrum) or by crafting transactions signed by Vultisig, to execute a swap on Uniswap V3 on Arbitrum testnet.
    *   Success Criteria: Able to programmatically execute a swap transaction (e.g., USDC to ARB) on Uniswap V3 (Arbitrum testnet) using Vultisig. The transaction is confirmed, and assets are received.

12. **Task 4.3: Orchestrated Arbitrage Execution Logic**
    *   Description: Integrate the profitability calculation with the trade execution functions. If a simulation predicts a profitable arbitrage opportunity exceeding a defined threshold, the bot should automatically execute the required sequence of trades. Implement robust state management to track multi-leg trades.
    *   Success Criteria: Bot can automatically execute an end-to-end arbitrage trade sequence on testnets/stagenets if deemed profitable by the simulation, handling the multi-step process.

**Phase 5: Core Bot Logic, Monitoring, and Refinement**

13. **Task 5.1: Main Bot Loop and Control Flow**
    *   Description: Develop the main application loop that:
        *   Periodically fetches prices and statuses from Maya and Uniswap.
        *   Runs simulations for configured asset pairs.
        *   Identifies arbitrage opportunities.
        *   Triggers trade execution logic if profitable.
        *   Implement robust error handling, retry mechanisms for API calls and transactions, and cool-down periods.
    *   Success Criteria: Bot operates continuously on testnet/stagenet, monitors markets, and attempts to execute arbitrage trades when profitable opportunities are detected. Handles transient errors gracefully.

14. **Task 5.2: Logging, Monitoring, and Alerting**
    *   Description: Implement comprehensive logging for:
        *   Price fetching and calculations.
        *   Simulation results (inputs, outputs, fees, slippage).
        *   Trade execution attempts (success, failure, transaction hashes).
        *   Errors and warnings.
        *   Calculated P&L for each arbitrage cycle.
        *   Set up basic monitoring (e.g., console output, file logs). Consider simple alerts for critical failures or successful large trades.
    *   Success Criteria: Detailed logs are produced, allowing for debugging, performance analysis, and auditing. Basic monitoring provides visibility into bot operations.

15. **Task 5.3: Comprehensive Testing (Unit, Integration, Scenario)**
    *   Description:
        *   Write unit tests for individual functions (price calculation, simulation components, etc.).
        *   Write integration tests for interactions between modules (e.g., data fetching + simulation).
        *   Conduct scenario testing on Maya Stagenet and Arbitrum testnet covering various market conditions and potential failures. Test edge cases (low liquidity, halted trading, high gas fees).
    *   Success Criteria: High test coverage. Bot demonstrates reliability and correctness across various simulated and live testnet scenarios.

16. **Task 5.4: Security Review and Hardening**
    *   Description:
        *   Review code for common security vulnerabilities (e.g., related to private key management if Vultisig interaction requires it directly, input validation, API interactions).
        *   Ensure secure handling of any sensitive configuration data.
        *   Validate transaction parameters carefully before signing/sending.
    *   Success Criteria: Security review completed, and any identified vulnerabilities are mitigated. Best practices for secure development are followed.

17. **Task 5.5: Code Refinement and Documentation**
    *   Description: Refactor code for clarity, efficiency, and maintainability. Document all modules, functions, and the overall architecture. Prepare a README for setup and operation.
    *   Success Criteria: Codebase is well-organized, commented, and understandable. Comprehensive documentation exists for developers and operators.

**Phase 6: Mainnet Preparation and Deployment (Proceed with Extreme Caution)**

18. **Task 6.1: Mainnet Configuration and Simulation-Only Mode**
    *   Description: Configure the bot for mainnet APIs and assets. Run the bot in a "simulation-only" or "dry-run" mode against mainnet data to observe potential opportunities and behavior without executing real trades.
    *   Success Criteria: Bot correctly identifies and simulates potential arbitrage opportunities using live mainnet data without executing any trades. Performance metrics align with expectations.

19. **Task 6.2: Limited Capital Mainnet Deployment & Monitoring**
    *   Description: **After extensive testing and risk assessment**, deploy the bot to mainnet with a very small amount of capital. Closely monitor all trades, P&L, gas costs, and slippage.
    *   Success Criteria: Bot executes profitable trades on mainnet with limited capital. All operations are closely monitored, and behavior matches testnet/simulation expectations.

20. **Task 6.3: Performance Optimization and Gradual Scaling**
    *   Description: Based on initial mainnet performance, identify bottlenecks and areas for optimization (e.g., API call frequency, transaction batching, gas price strategies). If consistently profitable and stable, gradually increase allocated capital.
    *   Success Criteria: Bot operates profitably and reliably on mainnet. Performance is continuously monitored and optimized. Capital allocation is managed based on risk and performance.

## 4. Project Status Board (ToDo)

**Phase 1: Setup and Foundation**
*   [x] Task 1.1: Project Setup & Environment Configuration
*   [ ] Task 1.2: Vultisig Wallet Integration - Setup and Basic Read Operations
*   [x] Task 1.3: Configuration Management

**Phase 2: Data Fetching and Price Discovery**
*   [x] Task 2.1: Maya Protocol Data Fetching - Pool Data & Trading Status
*   [x] Task 2.2: Uniswap (Arbitrum) Data Fetching - Pool Data & Price
*   [x] Task 2.3: Price Calculation and Normalization

**Phase 3: Trade Simulation**
*   [ ] Task 3.1: Maya Protocol Swap Simulation (`xchain-mayachain-amm`)
*   [ ] Task 3.2: Uniswap V3 Swap Simulation (Uniswap V3 SDK)
*   [ ] Task 3.3: Arbitrage Profitability Calculation

**Phase 4: Trade Execution (using Vultisig)**
*   [ ] Task 4.1: Maya Protocol Trade Execution
*   [ ] Task 4.2: Uniswap V3 Trade Execution
*   [ ] Task 4.3: Orchestrated Arbitrage Execution Logic

**Phase 5: Core Bot Logic, Monitoring, and Refinement**
*   [ ] Task 5.1: Main Bot Loop and Control Flow
*   [x] Task 5.2: Logging, Monitoring, and Alerting
*   [ ] Task 5.3: Comprehensive Testing (Unit, Integration, Scenario)
*   [ ] Task 5.4: Security Review and Hardening
*   [ ] Task 5.5: Code Refinement and Documentation

**Phase 6: Mainnet Preparation and Deployment**
*   [ ] Task 6.1: Mainnet Configuration and Simulation-Only Mode
*   [ ] Task 6.2: Limited Capital Mainnet Deployment & Monitoring
*   [ ] Task 6.3: Performance Optimization and Gradual Scaling

## 5. Executor's Feedback or Assistance Requests
I've completed the initial setup and foundation of the project, including:

1. Project structure and TypeScript configuration
2. Basic services for Maya Protocol and Uniswap data fetching
3. Price comparison service with arbitrage opportunity detection
4. Logging utility
5. Initial tests for the price service

When running the bot, I noticed a few issues that need to be addressed:
1. The Uniswap subgraph API is returning an error when querying for pool data. We need to verify the subgraph URL and query format.
2. The Maya inbound addresses check is failing to find some assets. We need to implement a more robust mapping between asset symbols and chain names.

Next steps:
1. Implement Vultisig SDK integration for wallet operations
2. Fix the Uniswap subgraph query issues
3. Implement proper asset-to-chain mapping for Maya Protocol
4. Begin implementing trade simulation for both platforms

## 6. Lessons
*(To be filled as lessons are learned during development)*
*   Consider using `ethers.js` version 5 if Uniswap V3 SDK examples are based on it, or ensure compatibility with v6.
*   `xchain-mayachain-amm` will be key for Maya simulations. Ensure its API is well understood.
*   Vultisig SDK documentation needs to be thoroughly reviewed for transaction signing and broadcasting capabilities on both Maya and EVM chains (Arbitrum).
*   Pay close attention to rate limits for Midgard API, Mayanode endpoints, and The Graph subgraphs.
*   When mocking services in tests, use `as unknown as ServiceType` pattern for partial mocks and add type assertions for mock functions. 