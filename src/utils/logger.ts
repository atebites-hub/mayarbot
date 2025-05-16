import fs from 'fs';
import path from 'path';
import config from '../../config/default';

/**
 * Simple logger utility for the arbitrage bot
 */
export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

/**
 * Creates and returns a logger instance based on configuration
 */
export function setupLogger(): Logger {
  // Create logs directory if it doesn't exist
  const logsDir = path.resolve(config.logging.filePath);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const logFilePath = path.join(logsDir, `bot-${new Date().toISOString().split('T')[0]}.log`);
  
  // Create a simple logger implementation
  const logger: Logger = {
    info: (message, ...args) => logMessage('INFO', message, ...args),
    warn: (message, ...args) => logMessage('WARN', message, ...args),
    error: (message, ...args) => logMessage('ERROR', message, ...args),
    debug: (message, ...args) => {
      if (config.logging.level === 'debug') {
        logMessage('DEBUG', message, ...args);
      }
    },
  };

  /**
   * Helper function to log a message to console and file
   */
  function logMessage(level: string, message: string, ...args: any[]) {
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
        const filePath = path.relative(process.cwd(), match[2]);
        const lineNumber = match[3];
        callerInfo = ` [${filePath}:${lineNumber}]`;
      }
    }
    const formattedMessage = `[${timestamp}] [${level}]${callerInfo} ${message}${args.length > 0 ? ': ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ') : ''}`;
    
    console.log(formattedMessage);
    
    // Append to log file
    fs.appendFileSync(logFilePath, formattedMessage + '\n');
  }

  return logger;
} 