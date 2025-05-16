"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOptimalBatchSize = findOptimalBatchSize;
console.log('[Optimizer Script] Top of file reached.'); // New top-level log
const ethers_1 = require("ethers");
const sdk_core_1 = require("@uniswap/sdk-core");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const jsbi_1 = __importDefault(require("jsbi"));
const IUniswapV3Pool_json_1 = __importDefault(require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json"));
const ethers_multicall_1 = require("ethers-multicall");
const default_1 = __importDefault(require("../../config/default"));
const logger_1 = require("./logger"); // Import setupLogger and the Logger interface
const ARBITRUM_ONE_CHAIN_ID = 42161;
const UNISWAP_V3_FACTORY_ADDRESS_ARBITRUM = '0x1F98431c8aD98523631AE4a59f267346ea31F984'; // Added constant
// --- Re-usable helper from UniswapService (or make it a shared util) ---
function feeToTickSpacing(feeAmount) {
    switch (feeAmount) {
        case v3_sdk_1.FeeAmount.LOWEST: return 1;
        case v3_sdk_1.FeeAmount.LOW: return 10;
        case v3_sdk_1.FeeAmount.MEDIUM: return 60;
        case v3_sdk_1.FeeAmount.HIGH: return 200;
        default: throw new Error(`Unknown fee amount: ${feeAmount}`);
    }
}
function _tickToWord(tick, tickSpacing) {
    let compressed = Math.floor(tick / tickSpacing);
    if (tick < 0 && tick % tickSpacing !== 0) {
        compressed -= 1;
    }
    return compressed >> 8;
}
// --- End Re-usable helper ---
async function timeBitmapFetching(poolAddress, tickSpacing, batchSize, multicallProvider, logger // Logger interface type
) {
    const multicallPoolContract = new ethers_multicall_1.Contract(poolAddress, IUniswapV3Pool_json_1.default.abi);
    const minWord = _tickToWord(v3_sdk_1.TickMath.MIN_TICK, tickSpacing);
    const maxWord = _tickToWord(v3_sdk_1.TickMath.MAX_TICK, tickSpacing);
    const tickIndicesToFetch = [];
    const wordPositions = [];
    for (let i = minWord; i <= maxWord; i++) {
        wordPositions.push(i);
    }
    logger.info(`[BitmapTimer Batch ${batchSize}] Word range: ${minWord} to ${maxWord} (${wordPositions.length} words).`);
    const startTime = Date.now();
    let allBitmapResults = [];
    try {
        for (let i = 0; i < wordPositions.length; i += batchSize) {
            const batchWordPositions = wordPositions.slice(i, i + batchSize);
            const bitmapCalls = batchWordPositions.map(pos => multicallPoolContract.tickBitmap(pos));
            logger.debug(`[BitmapTimer Batch ${batchSize}] Executing multicall for bitmap batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(wordPositions.length / batchSize)} (size ${bitmapCalls.length})`);
            const batchResults = await multicallProvider.all(bitmapCalls);
            allBitmapResults = allBitmapResults.concat(batchResults);
        }
        for (let i = 0; i < allBitmapResults.length; i++) {
            const bitmapWordIndex = wordPositions[i];
            const bitmap = jsbi_1.default.BigInt(allBitmapResults[i].toString());
            if (jsbi_1.default.notEqual(bitmap, jsbi_1.default.BigInt(0))) {
                for (let j = 0; j < 256; j++) {
                    const bit = jsbi_1.default.leftShift(jsbi_1.default.BigInt(1), jsbi_1.default.BigInt(j));
                    if (jsbi_1.default.notEqual(jsbi_1.default.bitwiseAnd(bitmap, bit), jsbi_1.default.BigInt(0))) {
                        const tickIndex = (bitmapWordIndex * 256 + j) * tickSpacing;
                        if (tickIndex >= v3_sdk_1.TickMath.MIN_TICK && tickIndex <= v3_sdk_1.TickMath.MAX_TICK) {
                            tickIndicesToFetch.push(tickIndex);
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        logger.error(`[BitmapTimer Batch ${batchSize}] Batched multicall for bitmaps failed: ${error.message}`);
        throw error;
    }
    const durationMs = Date.now() - startTime;
    logger.info(`[BitmapTimer Batch ${batchSize}] Found ${tickIndicesToFetch.length} tick indices. Duration: ${durationMs}ms`);
    tickIndicesToFetch.sort((a, b) => a - b);
    return { durationMs, tickIndices: tickIndicesToFetch };
}
async function timeTickDataFetching(poolAddress, tickIndices, batchSize, multicallProvider, logger // Logger interface type
) {
    if (tickIndices.length === 0) {
        return { durationMs: 0, fetchedTicksCount: 0 };
    }
    const multicallPoolContract = new ethers_multicall_1.Contract(poolAddress, IUniswapV3Pool_json_1.default.abi);
    let fetchedTicksCount = 0;
    logger.info(`[TickDataTimer Batch ${batchSize}] Fetching details for ${tickIndices.length} ticks.`);
    const startTime = Date.now();
    try {
        for (let i = 0; i < tickIndices.length; i += batchSize) {
            const batchTickIndices = tickIndices.slice(i, i + batchSize);
            const tickDataCalls = batchTickIndices.map(idx => multicallPoolContract.ticks(idx));
            logger.debug(`[TickDataTimer Batch ${batchSize}] Executing multicall for tick data batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickIndices.length / batchSize)} (size ${tickDataCalls.length})`);
            const batchResults = await multicallProvider.all(tickDataCalls);
            fetchedTicksCount += batchResults.length;
        }
    }
    catch (error) {
        logger.error(`[TickDataTimer Batch ${batchSize}] Batched multicall for tick details failed: ${error.message}`);
        throw error;
    }
    const durationMs = Date.now() - startTime;
    logger.info(`[TickDataTimer Batch ${batchSize}] Fetched data for ${fetchedTicksCount} ticks. Duration: ${durationMs}ms`);
    return { durationMs, fetchedTicksCount };
}
async function findOptimalBatchSize() {
    // Use the setupLogger function to get a logger instance
    const logger = (0, logger_1.setupLogger)();
    logger.info('Starting Batch Size Optimization Test...');
    const provider = new ethers_1.ethers.providers.JsonRpcProvider(default_1.default.arbitrum.rpcUrl);
    const network = await provider.getNetwork();
    const multicallProvider = new ethers_multicall_1.Provider(provider, network.chainId);
    const USDC_ARB_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
    const USDT_ARB_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
    const targetFee = v3_sdk_1.FeeAmount.LOWEST;
    const TOKEN0 = new sdk_core_1.Token(ARBITRUM_ONE_CHAIN_ID, USDC_ARB_ADDRESS, 6, 'USDC', 'USD Coin');
    const TOKEN1 = new sdk_core_1.Token(ARBITRUM_ONE_CHAIN_ID, USDT_ARB_ADDRESS, 6, 'USDT', 'Tether USD');
    const poolAddress = v3_sdk_1.Pool.getAddress(TOKEN0, TOKEN1, targetFee, undefined, UNISWAP_V3_FACTORY_ADDRESS_ARBITRUM);
    const tickSpacing = feeToTickSpacing(targetFee);
    logger.info(`Target Pool: USDC/USDT 0.01% (TickSpacing: ${tickSpacing})`);
    logger.info(`Pool Address: ${poolAddress}`);
    const batchSizesToTest = [50, 100, 150, 200, 250, 300, 400, 500, 600, 700];
    const results = [];
    const iterationsPerBatchSize = 3;
    for (const batchSize of batchSizesToTest) {
        logger.info(`--- Testing Batch Size: ${batchSize} ---`);
        let totalBitmapTime = 0;
        let totalTickDataTime = 0;
        let lastTickCount = 0;
        try {
            for (let i = 0; i < iterationsPerBatchSize; i++) {
                logger.info(`Iteration ${i + 1}/${iterationsPerBatchSize} for batch size ${batchSize}`);
                const bitmapResult = await timeBitmapFetching(poolAddress, tickSpacing, batchSize, multicallProvider, logger);
                totalBitmapTime += bitmapResult.durationMs;
                lastTickCount = bitmapResult.tickIndices.length;
                if (bitmapResult.tickIndices.length > 0) {
                    const tickDataResult = await timeTickDataFetching(poolAddress, bitmapResult.tickIndices, batchSize, multicallProvider, logger);
                    totalTickDataTime += tickDataResult.durationMs;
                }
                else {
                    logger.warn(`Skipping tick data fetching for batch size ${batchSize}, iteration ${i + 1} as no tick indices were found.`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            const avgBitmapTime = totalBitmapTime / iterationsPerBatchSize;
            const avgTickDataTime = totalTickDataTime / iterationsPerBatchSize;
            results.push({
                batchSize,
                bitmapTimeMs: parseFloat(avgBitmapTime.toFixed(2)),
                tickDataTimeMs: parseFloat(avgTickDataTime.toFixed(2)),
                totalTimeMs: parseFloat((avgBitmapTime + avgTickDataTime).toFixed(2)),
                tickCount: lastTickCount
            });
        }
        catch (error) {
            logger.error(`Error during test for batch size ${batchSize}: ${error}`);
            results.push({
                batchSize,
                bitmapTimeMs: -1,
                tickDataTimeMs: -1,
                totalTimeMs: -1,
                tickCount: 0
            });
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    logger.info('--- Batch Size Optimization Results ---');
    results.sort((a, b) => a.totalTimeMs - b.totalTimeMs);
    results.forEach(res => {
        logger.info(`Batch Size: ${res.batchSize}, Bitmaps: ${res.bitmapTimeMs}ms, TickData: ${res.tickDataTimeMs}ms, Total: ${res.totalTimeMs}ms, Ticks Found: ${res.tickCount}`);
    });
    if (results.length > 0 && results[0].totalTimeMs > 0) {
        logger.info(`Optimal Batch Size based on this run: ${results[0].batchSize} (Total Time: ${results[0].totalTimeMs}ms)`);
    }
    else {
        logger.warn('Could not determine optimal batch size from this run due to errors or no successful tests.');
    }
}
// Or setup a ts-node script in package.json like "optimize-batch": "ts-node src/utils/batchSizeOptimizer.ts"
console.log('[Optimizer Script] About to call findOptimalBatchSize().'); // New log before call
findOptimalBatchSize().catch(error => {
    console.error("[Optimizer Script] CRITICAL FAILURE in findOptimalBatchSize:", error);
});
