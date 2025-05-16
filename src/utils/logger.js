"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLogger = setupLogger;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const default_1 = __importDefault(require("../../config/default"));
/**
 * Creates and returns a logger instance based on configuration
 */
function setupLogger() {
    // Create logs directory if it doesn't exist
    const logsDir = path_1.default.resolve(default_1.default.logging.filePath);
    if (!fs_1.default.existsSync(logsDir)) {
        fs_1.default.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path_1.default.join(logsDir, `bot-${new Date().toISOString().split('T')[0]}.log`);
    // Create a simple logger implementation
    const logger = {
        info: (message, ...args) => logMessage('INFO', message, ...args),
        warn: (message, ...args) => logMessage('WARN', message, ...args),
        error: (message, ...args) => logMessage('ERROR', message, ...args),
        debug: (message, ...args) => {
            if (default_1.default.logging.level === 'debug') {
                logMessage('DEBUG', message, ...args);
            }
        },
    };
    /**
     * Helper function to log a message to console and file
     */
    function logMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        // Get call site information
        const err = new Error();
        const stack = err.stack?.split('\n');
        let callerInfo = '';
        if (stack && stack.length > 3) { // stack[0] is "Error", stack[1] is logMessage, stack[2] is the logger method (info, warn, etc.), stack[3] is the actual caller
            // Example line: "    at PriceService.checkArbitrageOpportunity (/Users/jaskarnbajwa/Documents/GitHub/mayarbot/src/services/price-service.ts:34:20)"
            const line = stack[3];
            const match = line.match(/at (.*) \((.*):(\d+):(\d+)\)/) || line.match(/at ()(.*):(\d+):(\d+)/); // Second pattern for anonymous functions or direct script calls
            if (match) {
                // const functionName = match[1] ? match[1].trim() : ''; // Can be useful too
                const filePath = path_1.default.relative(process.cwd(), match[2]);
                const lineNumber = match[3];
                callerInfo = ` [${filePath}:${lineNumber}]`;
            }
        }
        const formattedMessage = `[${timestamp}] [${level}]${callerInfo} ${message}${args.length > 0 ? ': ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ') : ''}`;
        console.log(formattedMessage);
        // Append to log file
        fs_1.default.appendFileSync(logFilePath, formattedMessage + '\n');
    }
    return logger;
}
