Project Requirements Document (PRD)
1. Project Overview
Project Name: Maya Protocol Arbitrage Bot
Purpose: To develop an automated arbitrage bot that exploits price differences between Maya Protocol and Uniswap on Arbitrum for specified assets, executing profitable trades while ensuring security, efficiency, and reliability.
Scope: The bot will integrate with Vultisig for transaction management, fetch real-time data from Maya Protocol’s Midgard API and Uniswap’s subgraph on Arbitrum, simulate trades to assess profitability, and execute trades when conditions are met.
Stakeholders: Development team, project manager, users/investors interested in arbitrage profits.
2. Functional Requirements
The arbitrage bot must fulfill the following functional requirements:
Wallet Integration:  
Integrate with the Vultisig SDK to securely sign and broadcast transactions on Maya Protocol and Arbitrum.

Support for sending transactions with memos required for Maya Protocol swaps.

Data Fetching:  
Retrieve pool data (prices, liquidity depths, trading status) from Maya Protocol using the Midgard API (/v2/pools, /v2/pool/{asset}).

Retrieve pool data from Uniswap V3 on Arbitrum using The Graph’s subgraph.

Price Comparison and Trading Status:  
Calculate price differences for specified assets (e.g., ARB, USDC) between Maya Protocol and Uniswap.

Verify that trading is active on both platforms before proceeding with any trade.

Trade Simulation:  
Simulate swaps on Maya Protocol using the xchain-mayachain-amm package to estimate output and fees.

Simulate swaps on Uniswap using the Uniswap V3 SDK to estimate output, price impact, and gas fees.

Calculate net profitability after accounting for transaction fees, gas costs, and slippage.

Trade Execution:  
If a profitable arbitrage opportunity is identified, execute the trade via Vultisig.

Handle two possible arbitrage flows:
If the asset is cheaper on Maya: Swap USDC → asset on Maya → USDC on Uniswap.

If the asset is cheaper on Uniswap: Swap USDC → asset on Uniswap → USDC on Maya.

Logging and Auditing:  
Log all activities, including price checks, trade simulations, and executed transactions.

Provide detailed transaction records for auditing and performance analysis.

3. Non-Functional Requirements
The bot must meet the following non-functional requirements:
Performance:  
Operate with minimal latency to capitalize on time-sensitive arbitrage opportunities.

Efficiently handle API rate limits and network latency.

Security:  
Securely manage wallet access and private keys (e.g., using environment variables or hardware wallets).

Ensure all transactions are signed and broadcasted securely via Vultisig.

Scalability:  
Support multiple assets and scale to handle increased trading volume.

Allow for easy addition of new assets or trading pairs.

Maintainability:  
Use modular code with clear documentation for easy updates and troubleshooting.

Implement error handling and retries for API failures or network issues.

4. Assumptions
Vultisig supports the necessary transaction types and memos for Maya Protocol swaps.

The Midgard API and Uniswap subgraph provide real-time, accurate data.

The bot has sufficient funds in the wallet to cover trading and gas fees.

The development team has access to necessary API keys and documentation.

5. Constraints
Network Latency: Delays in data fetching or transaction execution may reduce profitability.

API Rate Limits: Both Midgard and The Graph have rate limits that must be managed.

Gas Fees: High gas fees on Arbitrum may erode arbitrage profits.

Slippage: Large trades may experience slippage, especially in pools with low liquidity.

