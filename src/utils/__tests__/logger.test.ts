// Mock chalk to avoid ESM issues in Jest
jest.mock('chalk', () => {
  const mockChalk = {
    red: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    gray: (str: string) => str,
  };
  return {
    __esModule: true,
    default: mockChalk,
  };
});

import { logger } from '../logger';

describe('Logger', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console.error since logger outputs there
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    // Reset verbose mode
    logger.setVerbose(false);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('error', () => {
    it('should always log error messages', () => {
      logger.error('Test error');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toBe('Test error');
    });

    it('should log error messages even when verbose is disabled', () => {
      logger.setVerbose(false);
      logger.error('Test error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('warning', () => {
    it('should always log warning messages', () => {
      logger.warning('Test warning');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toBe('Test warning');
    });
  });

  describe('info', () => {
    it('should always log info messages', () => {
      logger.info('Test info');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toBe('Test info');
    });
  });

  describe('debug', () => {
    it('should not log debug messages when verbose is disabled', () => {
      logger.setVerbose(false);
      logger.debug('Test debug');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log debug messages when verbose is enabled', () => {
      logger.setVerbose(true);
      logger.debug('Test debug');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1]).toBe('Test debug');
    });
  });

  describe('setVerbose', () => {
    it('should enable verbose mode', () => {
      logger.setVerbose(true);
      expect(logger.isVerbose()).toBe(true);
    });

    it('should disable verbose mode', () => {
      logger.setVerbose(true);
      logger.setVerbose(false);
      expect(logger.isVerbose()).toBe(false);
    });
  });

  describe('with arguments', () => {
    it('should support additional arguments', () => {
      logger.setVerbose(true);
      logger.debug('Test', { foo: 'bar' }, 123);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.anything(),
        'Test',
        { foo: 'bar' },
        123
      );
    });
  });
});
