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
*   [x] Task 5.5: Code Refinement and Documentation - Updated README.md

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

### 2025-05-15 Bot Re-run after Endpoint Fixes (Executor)

* Maya Stagenet endpoints now connect successfully.
* Uniswap subgraph endpoint (`uniswap-v3-arbitrum-goerli`) returns GraphQL error: "This endpoint has been removed." → need new subgraph URL for Arbitrum testnet or switch to new chain/network.
* Maya inbound addresses fetched, but chain symbol mapping for USDC still fails (`Chain USDC not found in inbound addresses`). Need asset→chain map or handle ERC20 CACAO.

Suggested next tasks:
1. Find current Uniswap V3 Arbitrum Goerli (or Sepolia) subgraph URL, update config.
2. Improve chain mapping in `MayaService.isChainHalted` to map ARB and ERC20 symbols to chain names.

Awaiting Planner guidance or proceed to implement.

### README Update (Executor) - 2025-05-16
The `README.md` has been updated with comprehensive information about the project, including setup, how it works, technology stack, testing, and risk disclaimers. Please review the updated `README.md`.

### Uniswap Pricing Issue (Executor) - 2025-05-16
The bot is currently unable to fetch prices from Uniswap for USDC/USDT. The logs show:
`[WARN] [src/services/price-service.ts:150] Could not get Uniswap quote for USDC -> USDT: Invariant failed: ZERO_NET`
This suggests a problem with the Uniswap V3 pool for USDC/USDT on Arbitrum, possibly related to incorrect token addresses, fee tier, or lack of liquidity.
Investigation into `src/services/price-service.ts` and `src/services/uniswap-service.ts` is needed.

**Analysis (Executor) - 2025-05-16**
After reviewing `price-service.ts` and `uniswap-service.ts`:
- Token addresses for USDC (0xaf88...) and USDT (0xfd08...) on Arbitrum Mainnet (Chain ID 42161) seem correct and are dynamically confirmed for USDT via Maya.
- The Uniswap V3 SDK is used to find the best trade by iterating through LOWEST (0.01%), LOW (0.05%), and MEDIUM (0.3%) fee tiers.
- The `getPoolInfoAndTicks` function in `uniswap-service.ts` currently provides only the *single active tick* to the `TickListDataProvider`.
- The "Invariant failed: ZERO_NET" error from the Uniswap SDK likely occurs because `Trade.fromRoute` requires a window of surrounding tick data, not just the active tick, to properly simulate the swap, especially if the active tick has zero net liquidity or the swap crosses ticks.

**Hypothesis:** The `TickListDataProvider` is not being supplied with sufficient tick data for the Uniswap SDK to calculate the trade path, leading to the ZERO_NET error.

**Next Step:** Modify `uniswap-service.ts` to fetch a broader range of ticks for the `TickListDataProvider` or investigate if the specific USDC/USDT pool exists and has liquidity on the attempted fee tiers.

**Log Analysis (Executor) - 2025-05-16 (after detailed logging)**
The detailed logs from `uniswap-service.ts` revealed the following:
- **Fee LOWEST (0.01%, tickSpacing 1, Pool `0xbE3...`)**:
    - Pool and active tick (-3) data are fetched successfully, with positive net liquidity.
    - `ERROR during Pool construction: Invariant failed: ZERO_NET` occurs.
    - Stack trace points to `TickListDataProvider.validateList` / `new TickListDataProvider`. This suggests that providing only the single active tick, even if liquid, is insufficient for the SDK's internal validation or subsequent `Pool` logic, likely requiring a broader view of the tick landscape as per Uniswap's documentation on fetching full pool data.
- **Fee LOW (0.05%, tickSpacing 10, Pool `0xbcE...`)**:
    - `slot0.tick` is -1. Active tick details show 0 gross/net liquidity.
    - `ERROR during Pool construction: Invariant failed: TICK_SPACING` occurs.
    - The error is because the provided tick index (-1) is not divisible by the `tickSpacing` (10), which is a requirement for ticks passed to `TickListDataProvider`.
- **Fee MEDIUM (0.3%, tickSpacing 60, Pool `0x995...`)**:
    - `slot0.tick` is 16. Active tick details show 0 gross/net liquidity.
    - `ERROR during Pool construction: Invariant failed: TICK_SPACING` occurs.
    - Similar to the LOW fee tier, the tick index (16) is not divisible by `tickSpacing` (60).

**Root Causes:**
1.  **`ZERO_NET` (LOWEST Fee Tier):** Likely due to `TickListDataProvider` receiving only a single tick. The SDK expects a more complete set of initialized ticks to accurately model the pool's liquidity profile, as highlighted in Uniswap's "Fetching Pool Data" guide.
2.  **`TICK_SPACING` (LOW & MEDIUM Fee Tiers):** The `slot0.tick` (current market tick) is being directly used as the index for the single tick provided to `TickListDataProvider`. However, this provider expects tick indices that are multiples of the pool's `tickSpacing`. `slot0.tick` often doesn't meet this criterion.

**Solution Path & Next Steps:**
1.  **Implement Full Tick Fetching:** The most robust solution is to modify `uniswap-service.ts` to fetch *all* initialized ticks for a given pool, as detailed in the Uniswap SDK documentation ("Fetching Pool Data" guide - [https://docs.uniswap.org/sdk/v3/guides/advanced/pool-data](https://docs.uniswap.org/sdk/v3/guides/advanced/pool-data)). This involves:
    a. Calculating bitmap word positions.
    b. Fetching all bitmaps (ideally using multicall).
    c. Deriving all initialized tick indices from these bitmaps.
    d. Fetching the `liquidityGross` and `liquidityNet` for each initialized tick (ideally using multicall).
    e. Constructing `Tick` objects for all initialized ticks.
    f. Passing this complete list of `Tick` objects to `TickListDataProvider` when creating the `Pool` instance.
2.  This will resolve both the `ZERO_NET` (by providing sufficient context) and `TICK_SPACING` (by only using valid, initialized tick indices) errors.
3.  The current `getPoolInfoAndTicks` needs to be significantly refactored or replaced to support this.

Awaiting user confirmation to proceed with implementing the full tick fetching mechanism. This is a more substantial code change.

**Update (Executor) - 2025-05-16: Batched Multicall Implementation**
Implemented batching for multicall requests within `_fetchAllInitializedTicks` in `uniswap-service.ts` (using `BATCH_SIZE = 200`).
- **Success:** All fee tiers, including the `LOWEST` (0.01%) tier for the highly active USDC/USDT pool, now successfully fetch all initialized ticks, construct the `Pool` object, and allow for trade simulation.
- The previous `CALL_EXCEPTION` on the LOWEST tier due to oversized multicall requests is resolved.
- The bot now correctly identifies the best price across the attempted fee tiers.

**Update (Executor) - 2025-05-16: Optimal Batch Size & Single Fee Tier**
1.  The `batchSizeOptimizer.ts` script was run, and an optimal `BATCH_SIZE` of **700** was determined for the QuikNode RPC provider with the USDC/USDT 0.01% pool.
2.  `uniswap-service.ts` has been updated to use this `BATCH_SIZE = 700`.
3.  `uniswap-service.ts` has been modified so `getBestV3TradeExactIn` now only queries the `FeeAmount.LOWEST` tier, as requested, to improve speed.

**Update (Executor) - 2025-05-16: Selective Tick Fetching Attempt & Reversion**
- Attempted to implement selective tick fetching (50% of ticks around `slot0.tick`) to further improve speed.
- This led to `Invariant failed: ZERO_NET` errors from the Uniswap SDK's `TickListDataProvider`, indicating that providing a partial set of ticks, even a large one, can violate SDK invariants.
- The selective tick fetching logic was reverted. `_fetchAllInitializedTicks` now robustly fetches all initialized ticks for the required fee tier, using the optimized batch size.

**Update (Executor) - 2025-05-16: In-Memory Tick Cache Implementation**
- Implemented an in-memory cache (`tickCache` with a `CACHE_TTL_MS` of 5 minutes) within `UniswapService`.
- `_fetchAllInitializedTicks` now checks this cache before fetching. If a valid, non-stale entry for a pool exists, the cached tick data is used, significantly speeding up subsequent calls for the same pool within the TTL.
- Initial fetch for USDC/USDT 0.01% pool takes ~5.7 seconds; subsequent calls within 5 mins for this pool will use cached data for ticks.

**Summary of Optimizations Applied (User Plan Points 0, 1, 3, 4):**
-   **RPC Provider**: Confirmed usage of user-provided QuikNode URL from `.env`.
-   **Optimal Batch Size**: Determined as 700 and applied in `uniswap-service.ts`.
-   **Single Fee Tier**: `UniswapService` now exclusively checks `FeeAmount.LOWEST`.
-   **Tick Data Caching**: In-memory cache for fetched tick data is active.
-   **Selective Tick Fetching (Point 2)**: Attempted but deemed unreliable with current SDK behavior; reverted to full (batched) tick fetching for robustness.

**Performance Status:**
- Uniswap data fetching is now robust and significantly faster.
- First fetch for a complex pool (USDC/USDT 0.01%) is ~5-6 seconds.
- Subsequent fetches for the same pool (within cache TTL) are very fast for the tick data portion.

For now, the core pricing functionality is working correctly. Further speed optimizations depend on the specific latency requirements and willingness to explore external services or more complex caching.

**Current Task: Implement Selective Tick Fetching (Point 2 from user plan)**
- Modify `_fetchAllInitializedTicks` to support fetching a configurable percentage of initialized ticks around `slot0.tick`.
- Initial target: 50% of ticks.
- This will still require fetching all bitmaps first to know where all initialized ticks are.
- The goal is to reduce the number of `multicallPoolContract.ticks()` calls while maintaining sufficient data for accurate pricing.

## 6. Lessons
*(To be filled as lessons are learned during development)*
*   Consider using `ethers.js` version 5 if Uniswap V3 SDK examples are based on it, or ensure compatibility with v6.
*   `xchain-mayachain-amm` will be key for Maya simulations. Ensure its API is well understood.
*   Vultisig SDK documentation needs to be thoroughly reviewed for transaction signing and broadcasting capabilities on both Maya and EVM chains (Arbitrum).
*   Pay close attention to rate limits for Midgard API, Mayanode endpoints, and The Graph subgraphs.
*   When mocking services in tests, use `as unknown as ServiceType` pattern for partial mocks and add type assertions for mock functions.
*   Public Stagenet endpoints differ from NineRealms demo domains. Use `*.mayachain.info` for Midgard & MAYANode.
*   Always safe-check optional fields when parsing The Graph responses – failure to do so will crash the bot.

NOTE: The Graph now requires authenticated Gateway requests. Users must obtain a free API key (`GRAPH_API_KEY`) from https://thegraph.com (dashboard) and set it in `.env`. Unauthenticated fallback will fail with `deployment ... does not exist`. 