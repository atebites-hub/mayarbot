import fs from 'fs';
import path from 'path';
import config from '../../config/default';

/**
 * Simple logger utility for the arbitrage bot
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
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
    info: (message) => logMessage('INFO', message),
    warn: (message) => logMessage('WARN', message),
    error: (message) => logMessage('ERROR', message),
    debug: (message) => {
      if (config.logging.level === 'debug') {
        logMessage('DEBUG', message);
      }
    },
  };

  /**
   * Helper function to log a message to console and file
   */
  function logMessage(level: string, message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(formattedMessage);
    
    // Append to log file
    fs.appendFileSync(logFilePath, formattedMessage + '\n');
  }

  return logger;
} 