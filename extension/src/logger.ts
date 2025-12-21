import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | null = null;

/**
 * Initialize the logger with an OutputChannel
 * @param name The name of the output channel
 */
export function initializeLogger(name: string = 'Coding Rule Checker'): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(name);
  }
}

/**
 * Get the OutputChannel instance
 * @returns The OutputChannel instance or null if not initialized
 */
export function getOutputChannel(): vscode.OutputChannel | null {
  return outputChannel;
}

/**
 * Log an info message
 * @param message The message to log
 * @param args Additional arguments to log
 */
export function log(message: string, ...args: any[]): void {
  const formattedMessage = formatMessage('INFO', message, args);

  if (outputChannel) {
    outputChannel.appendLine(formattedMessage);
  }

  // Also log to console for debugging
  console.log(formattedMessage);
}

/**
 * Log an error message
 * @param message The error message to log
 * @param args Additional arguments to log
 */
export function error(message: string, ...args: any[]): void {
  const formattedMessage = formatMessage('ERROR', message, args);

  if (outputChannel) {
    outputChannel.appendLine(formattedMessage);
  }

  // Also log to console for debugging
  console.error(formattedMessage);
}

/**
 * Log a warning message
 * @param message The warning message to log
 * @param args Additional arguments to log
 */
export function warn(message: string, ...args: any[]): void {
  const formattedMessage = formatMessage('WARN', message, args);

  if (outputChannel) {
    outputChannel.appendLine(formattedMessage);
  }

  // Also log to console for debugging
  console.warn(formattedMessage);
}

/**
 * Show the output channel
 */
export function show(): void {
  if (outputChannel) {
    outputChannel.show();
  }
}

/**
 * Format a log message with timestamp and level
 */
function formatMessage(level: string, message: string, args: any[]): string {
  const timestamp = new Date().toISOString();
  const argsString = args.length > 0
    ? ' ' + args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ')
    : '';

  return `[${timestamp}] [${level}] ${message}${argsString}`;
}
