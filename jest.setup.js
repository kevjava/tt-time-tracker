/**
 * Jest global setup
 * Suppress console output during tests to keep test output clean
 */

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

// Mock console methods globally
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Export originals in case tests need them
global.originalConsole = originalConsole;
