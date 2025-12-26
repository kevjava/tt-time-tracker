import chalk from 'chalk';

/**
 * Global logger for TT time tracker
 * Supports error, warning, info, and debug levels
 * Debug messages only shown when verbose mode is enabled
 */
class Logger {
  private verbose: boolean = false;

  /**
   * Enable or disable verbose mode
   */
  setVerbose(enabled: boolean): void {
    this.verbose = enabled;
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return this.verbose;
  }

  /**
   * Log an error message (always shown, red)
   */
  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red('ERROR:'), message, ...args);
  }

  /**
   * Log a warning message (always shown, yellow)
   */
  warning(message: string, ...args: unknown[]): void {
    console.error(chalk.yellow('WARNING:'), message, ...args);
  }

  /**
   * Log an info message (always shown, cyan)
   */
  info(message: string, ...args: unknown[]): void {
    console.error(chalk.cyan('INFO:'), message, ...args);
  }

  /**
   * Log a debug message (only shown in verbose mode, gray)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      console.error(chalk.gray('DEBUG:'), message, ...args);
    }
  }
}

// Export singleton instance
export const logger = new Logger();
