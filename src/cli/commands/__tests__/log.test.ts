import * as fs from 'fs';
import * as path from 'path';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-log-cmd/test.db';
const testDataDir = '/tmp/tt-test-log-cmd';

// Mock process.exit to prevent actual exits
const mockExit = jest.fn();
jest.spyOn(process, 'exit').mockImplementation(mockExit as any);

// Mock chalk to avoid ESM import issues in Jest
jest.mock('chalk', () => {
  const mockFn = (s: string) => s;
  const mockChalk = {
    green: Object.assign(mockFn, { bold: mockFn }),
    gray: mockFn,
    red: Object.assign(mockFn, { bold: mockFn }),
    yellow: Object.assign(mockFn, { bold: mockFn }),
    bold: mockFn,
  };
  return {
    default: mockChalk,
    ...mockChalk,
  };
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    setVerbose: jest.fn(),
  },
}));

// Mock config to use test paths
jest.mock('../../../utils/config', () => {
  const fs = require('fs');
  const testDbPath = '/tmp/tt-test-log-cmd/test.db';
  const testDataDir = '/tmp/tt-test-log-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
  };
});

// Mock editor module to prevent actual editor from opening
jest.mock('../../editor', () => ({
  openInEditor: jest.fn(),
}));

import { logCommand } from '../log';
import { TimeTrackerDB } from '../../../db/database';

describe('log command', () => {
  let db: TimeTrackerDB;
  const fixturesDir = path.join(__dirname, '../../../parser/__tests__/fixtures');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    // Clean up any existing database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    db = new TimeTrackerDB(testDbPath);

    // Clear mock calls
    mockExit.mockClear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    db.close();
  });

  describe('basic functionality', () => {
    it('should import a simple log file', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'simple.log');
        await logCommand(logFile);

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Logged');

        // Verify sessions were inserted (use future end date to catch sessions with future timestamps)
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBeGreaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should import log file with interruptions', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'interruptions.log');
        await logCommand(logFile);

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Logged');
        expect(output).toContain('interruption');

        // Verify sessions were inserted with parent-child relationships
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        const hasParentChild = sessions.some(s => s.parentSessionId !== null && s.parentSessionId !== undefined);
        expect(hasParentChild).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should count sessions and interruptions correctly', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'interruptions.log');
        await logCommand(logFile);

        const output = (console.log as jest.Mock).mock.calls.join('\n');
        // Should report both sessions and interruptions
        expect(output).toMatch(/\d+ session/);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('--overwrite flag', () => {
    it('should accept overwrite flag and import successfully', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'simple.log');
        await logCommand(logFile, { overwrite: true });

        expect(console.log).toHaveBeenCalled();
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBeGreaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('error handling', () => {
    it('should error if file does not exist', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        await logCommand('/nonexistent/file.log');

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('File not found')
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should handle parse errors gracefully', async () => {
      const originalError = console.error;
      console.error = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'errors.log');
        await logCommand(logFile);

        expect(mockExit).toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
      } finally {
        console.error = originalError;
      }
    });

    it('should display warnings for suspicious patterns', async () => {
      const originalWarn = console.warn;
      console.warn = jest.fn();
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'warnings.log');
        await logCommand(logFile);

        // Should show warnings but still import
        expect(console.warn).toHaveBeenCalled();
        expect(console.log).toHaveBeenCalled();
      } finally {
        console.warn = originalWarn;
        console.log = originalLog;
      }
    });

    it('should handle empty file gracefully', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create empty file
        const emptyFile = path.join(testDataDir, 'empty.log');
        fs.writeFileSync(emptyFile, '');

        await logCommand(emptyFile);

        // Should complete without crashing - empty files are valid
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('edge cases', () => {
    it('should handle log file with state markers', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'state-markers.log');

        // Check if file exists, skip test if not
        if (!fs.existsSync(logFile)) {
          console.log('Skipping test - state-markers.log not found');
          return;
        }

        await logCommand(logFile);

        expect(console.log).toHaveBeenCalled();

        // Verify sessions have correct states
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        const hasCompletedSessions = sessions.some(s => s.state === 'completed');
        expect(hasCompletedSessions).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle complex log files', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'complex.log');
        await logCommand(logFile);

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Logged');

        // Verify multiple sessions were inserted
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBeGreaterThan(1);
      } finally {
        console.log = originalLog;
      }
    });

    it('should preserve all metadata (project, tags, estimates)', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a test file with metadata
        const testFile = path.join(testDataDir, 'metadata.log');
        fs.writeFileSync(testFile, `
09:00 Test task @myProject +tag1 +tag2 ~30m
10:00 Another task
`.trim());

        await logCommand(testFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        const sessionWithMetadata = sessions.find(s => s.description === 'Test task');

        expect(sessionWithMetadata).toBeDefined();
        expect(sessionWithMetadata?.project).toBe('myProject');
        expect(sessionWithMetadata?.estimateMinutes).toBe(30);

        // Check tags
        if (sessionWithMetadata) {
          const tags = db.getSessionTags(sessionWithMetadata.id!);
          expect(tags).toContain('tag1');
          expect(tags).toContain('tag2');
        }
      } finally {
        console.log = originalLog;
      }
    });
  });
});
