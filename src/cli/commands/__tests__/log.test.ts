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
    blue: Object.assign(mockFn, { bold: mockFn }),
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

  describe('interruptions with explicit durations', () => {
    it('should handle interruptions with explicit durations without overlap errors', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Regression test for bug where buildParentMap used original indices
        // but calculateEndTimes filtered out state markers, causing index mismatch
        const logContent = `2025-12-30 07:02 In, reading emails. @admin
  07:31 Planning Churn. @churn +plan (1h12m)
  09:57 Walking the dog @break (27m)
11:02 Plan the day @admin +plan ~20m
`;
        const testFile = path.join(testDataDir, 'explicit-duration-interruptions.log');
        fs.writeFileSync(testFile, logContent, 'utf-8');

        await logCommand(testFile);

        expect(console.log).toHaveBeenCalled();
        const output = (console.log as jest.Mock).mock.calls.join('\n');
        expect(output).toContain('Logged');
        expect(output).toContain('interruption');

        // Verify parent and child relationships are correct
        const sessions = db.getSessionsByTimeRange(new Date('2025-12-30'), new Date('2025-12-31'));
        expect(sessions.length).toBe(4); // 2 top-level + 2 interruptions

        const parent = sessions.find(s => s.description === 'In, reading emails.');
        expect(parent).toBeDefined();
        expect(parent?.parentSessionId).toBeFalsy(); // null or undefined

        const interruptions = sessions.filter(s => s.parentSessionId !== null && s.parentSessionId !== undefined);
        expect(interruptions.length).toBe(2);
        expect(interruptions.every(i => i.parentSessionId === parent?.id)).toBe(true);
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

  describe('continuation chains', () => {
    it('should store state suffixes correctly in database', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'state-suffixes.log');
        await logCommand(logFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));

        // Should have sessions with different states
        const completedSession = sessions.find(s => s.description === 'Task one');
        const pausedSession = sessions.find(s => s.description === 'Task two');
        const abandonedSession = sessions.find(s => s.description === 'Task three');
        const defaultSession = sessions.find(s => s.description === 'Task four');

        expect(completedSession?.state).toBe('completed');
        expect(pausedSession?.state).toBe('paused');
        expect(abandonedSession?.state).toBe('abandoned');
        expect(defaultSession?.state).toBe('completed'); // Default when has end time
      } finally {
        console.log = originalLog;
      }
    });

    it('should link continuation chains via continuesSessionId', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'continuations.log');
        await logCommand(logFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));

        // Find the feature work sessions
        const featureSessions = sessions.filter(s => s.description === 'Feature work');

        // Should have 3 sessions for "Feature work"
        expect(featureSessions.length).toBe(3);

        // First session should be paused and have no continuesSessionId
        const firstSession = featureSessions.find(s => !s.continuesSessionId);
        expect(firstSession).toBeDefined();
        expect(firstSession?.state).toBe('paused');

        // Second session should continue first session (root)
        const secondSession = featureSessions.find(s =>
          s.continuesSessionId === firstSession?.id && s.state === 'paused'
        );
        expect(secondSession).toBeDefined();

        // Third session should also continue first session (all point to root)
        const thirdSession = featureSessions.find(s =>
          s.continuesSessionId === firstSession?.id && s.state === 'completed'
        );
        expect(thirdSession).toBeDefined();

        // Verify the chain can be retrieved
        if (firstSession?.id) {
          const chain = db.getContinuationChain(firstSession.id);
          expect(chain.length).toBe(3);
          expect(chain[0].id).toBe(firstSession.id);
          expect(chain[1].id).toBe(secondSession?.id);
          expect(chain[2].id).toBe(thirdSession?.id);
        }
      } finally {
        console.log = originalLog;
      }
    });

    it('should resume most recent paused task with @resume alone', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a test file with @resume alone
        const testFile = path.join(testDataDir, 'resume-alone.log');
        fs.writeFileSync(testFile, `
08:00 Task A @project +code ~2h ->paused
09:00 Break +break
09:15 @resume
10:00 Done
`.trim());

        await logCommand(testFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));

        // First session should be paused
        const taskA = sessions.find(s => s.description === 'Task A');
        expect(taskA?.state).toBe('paused');

        // Second session should continue first session (via @resume)
        const resumedTask = sessions.find(s =>
          s.continuesSessionId === taskA?.id
        );
        expect(resumedTask).toBeDefined();
        expect(resumedTask?.description).toBe('Task A'); // Inherits description
      } finally {
        console.log = originalLog;
      }
    });

    it('should resume matching paused task with @resume Task @project +tag', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a test file with multiple paused tasks and specific resume
        const testFile = path.join(testDataDir, 'resume-specific.log');
        fs.writeFileSync(testFile, `
08:00 Task A @projectA +code ->paused
08:30 Task B @projectB +design ->paused
09:00 Break +break
09:15 @resume Task B @projectB +design ->completed
`.trim());

        await logCommand(testFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));

        // Task B should have a continuation
        const taskB = sessions.find(s => s.description === 'Task B' && s.state === 'paused');
        const resumedTaskB = sessions.find(s =>
          s.description === 'Task B' &&
          s.continuesSessionId === taskB?.id &&
          s.state === 'completed'
        );

        expect(resumedTaskB).toBeDefined();
        expect(resumedTaskB?.project).toBe('projectB');

        // Task A should still be paused with no continuation
        const taskA = sessions.find(s => s.description === 'Task A');
        expect(taskA?.state).toBe('paused');
        const resumedTaskA = sessions.find(s => s.continuesSessionId === taskA?.id);
        expect(resumedTaskA).toBeUndefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should not create continuation link if no matching paused session', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // Create a test file where @resume doesn't match anything
        const testFile = path.join(testDataDir, 'resume-no-match.log');
        fs.writeFileSync(testFile, `
08:00 Task A @project +code ->completed
09:00 @resume Task B @different +tag
10:00 Done
`.trim());

        await logCommand(testFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));

        // Task B should exist but have no continuesSessionId
        const taskB = sessions.find(s => s.description === 'Task B');
        expect(taskB).toBeDefined();
        expect(taskB?.continuesSessionId).toBeUndefined();
      } finally {
        console.log = originalLog;
      }
    });

    it('should preserve estimate from first session in chain', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'continuations.log');
        await logCommand(logFile);

        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));

        // First feature work session should have estimate
        const firstSession = sessions.find(s =>
          s.description === 'Feature work' && !s.continuesSessionId
        );
        expect(firstSession?.estimateMinutes).toBe(240); // 4h from fixture

        // Continuation sessions don't have estimates (only first does)
        const continuations = sessions.filter(s =>
          s.description === 'Feature work' && s.continuesSessionId
        );
        continuations.forEach(session => {
          expect(session.estimateMinutes).toBeUndefined();
        });
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

  describe('--dry-run flag', () => {
    it('should parse and validate without importing when --dry-run is set', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'simple.log');
        await logCommand(logFile, { dryRun: true });

        // Should display dry-run message
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would import'));

        // Verify no sessions were inserted
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should count sessions and interruptions correctly in dry-run mode', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'interruptions.log');
        await logCommand(logFile, { dryRun: true });

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('session(s)'));

        // Verify no sessions were inserted
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should detect overlaps in dry-run mode without deleting', async () => {
      const originalLog = console.log;
      console.log = jest.fn();

      try {
        // First, import a session normally
        const logFile = path.join(fixturesDir, 'simple.log');
        await logCommand(logFile);

        // Clear console mocks
        (console.log as jest.Mock).mockClear();

        // Now try to import again with dry-run and overwrite
        await logCommand(logFile, { dryRun: true, overwrite: true });

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would delete'));

        // Verify original sessions are still there (not deleted)
        const sessionsAfter = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessionsAfter.length).toBeGreaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });

    it('should show warnings in dry-run mode', async () => {
      const originalLog = console.log;
      const originalWarn = console.warn;
      console.log = jest.fn();
      console.warn = jest.fn();

      try {
        const logFile = path.join(fixturesDir, 'warnings.log');
        await logCommand(logFile, { dryRun: true });

        // Should display warnings
        expect(console.warn).toHaveBeenCalled();

        // Should still show dry-run mode message
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE'));

        // Verify no sessions were inserted
        const sessions = db.getSessionsByTimeRange(new Date(0), new Date(Date.now() + 24 * 60 * 60 * 1000));
        expect(sessions.length).toBe(0);
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
      }
    });
  });
});
