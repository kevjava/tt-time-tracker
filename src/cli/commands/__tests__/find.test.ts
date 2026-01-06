import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-find-cmd/test.db';
const testDataDir = '/tmp/tt-test-find-cmd';

// Mock process.exit to prevent actual exits
const mockExit = jest.fn();
jest.spyOn(process, 'exit').mockImplementation(mockExit as any);

// Mock chalk to avoid ESM import issues in Jest
jest.mock('chalk', () => {
  const mockFn = (s: string) => s;
  const mockChalk = {
    green: Object.assign(mockFn, { bold: mockFn }),
    gray: mockFn,
    red: mockFn,
    yellow: Object.assign(mockFn, { bold: mockFn }),
    cyan: mockFn,
    magenta: mockFn,
    blue: mockFn,
    italic: mockFn,
    dim: mockFn,
    bold: Object.assign(mockFn, {
      cyan: mockFn,
      yellow: mockFn,
      green: mockFn,
    }),
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
  const testDbPath = '/tmp/tt-test-find-cmd/test.db';
  const testDataDir = '/tmp/tt-test-find-cmd';

  return {
    getDatabasePath: jest.fn(() => testDbPath),
    ensureDataDir: jest.fn(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    }),
    loadConfig: jest.fn(() => ({
      weekStartDay: 'monday',
      reportFormat: 'terminal',
      listFormat: 'table',
      timeFormat: '24h',
      editor: '',
    })),
  };
});

import { findCommand } from '../find';
import { TimeTrackerDB } from '../../../db/database';

describe('find command', () => {
  let db: TimeTrackerDB;

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

  describe('query parsing', () => {
    it('should search by description term', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Run tests',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'Review code',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('Run', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Run tests');
      expect(output).not.toContain('Review code');

      console.log = originalLog;
    });

    it('should search by project using @ syntax', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        project: 'projectA',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'Task 2',
        project: 'projectB',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('@projectA', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Task 1');
      expect(output).toContain('projectA');
      expect(output).not.toContain('Task 2');

      console.log = originalLog;
    });

    it('should search by tag using + syntax', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, ['code', 'testing']);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'Task 2',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, ['review']);

      findCommand('+code', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Task 1');
      expect(output).not.toContain('Task 2');

      console.log = originalLog;
    });

    it('should search with combined filters (project, tag, description)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Run tests',
        project: 'projectA',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, ['code']);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'Run benchmarks',
        project: 'projectB',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, ['perf']);

      const session3Id = db.insertSession({
        startTime: new Date('2025-01-01T14:00:00'),
        endTime: new Date('2025-01-01T15:00:00'),
        description: 'Review tests',
        project: 'projectA',
        state: 'completed',
      });
      db.insertSessionTags(session3Id, ['code', 'review']);

      findCommand('@projectA +code Run', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Run tests');
      expect(output).not.toContain('Run benchmarks');
      expect(output).not.toContain('Review tests');

      console.log = originalLog;
    });

    it('should search with multiple tags', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, ['code', 'review']);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'Task 2',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, ['code']);

      findCommand('+code +review', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Task 1');
      expect(output).not.toContain('Task 2');

      console.log = originalLog;
    });
  });

  describe('search behavior', () => {
    it('should be case-insensitive', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Run tests',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'running benchmarks',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('RUN', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Run tests');
      expect(output).toContain('running benchmarks');

      console.log = originalLog;
    });

    it('should match partial words', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Running tests',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      findCommand('run', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Running tests');

      console.log = originalLog;
    });

    it('should require all description terms to match (AND logic)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Run integration tests',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: new Date('2025-01-01T13:00:00'),
        description: 'Run benchmarks',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('Run tests', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Run integration tests');
      expect(output).not.toContain('Run benchmarks');

      console.log = originalLog;
    });
  });

  describe('date filtering', () => {
    it('should filter by --from date', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-05T10:00:00'),
        endTime: new Date('2025-01-05T11:00:00'),
        description: 'Task 2',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('Task', { from: '2025-01-03' });

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).not.toContain('Task 1');
      expect(output).toContain('Task 2');

      console.log = originalLog;
    });

    it('should filter by --to date', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-05T10:00:00'),
        endTime: new Date('2025-01-05T11:00:00'),
        description: 'Task 2',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('Task', { to: '2025-01-03' });

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Task 1');
      expect(output).not.toContain('Task 2');

      console.log = originalLog;
    });

    it('should filter by date range (--from and --to)', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-05T10:00:00'),
        endTime: new Date('2025-01-05T11:00:00'),
        description: 'Task 2',
        state: 'completed',
      });
      db.insertSessionTags(session2Id, []);

      const session3Id = db.insertSession({
        startTime: new Date('2025-01-10T10:00:00'),
        endTime: new Date('2025-01-10T11:00:00'),
        description: 'Task 3',
        state: 'completed',
      });
      db.insertSessionTags(session3Id, []);

      findCommand('Task', { from: '2025-01-03', to: '2025-01-08' });

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).not.toContain('Task 1');
      expect(output).toContain('Task 2');
      expect(output).not.toContain('Task 3');

      console.log = originalLog;
    });
  });

  describe('state filtering', () => {
    it('should filter by --state option', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test sessions
      const session1Id = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(session1Id, []);

      const session2Id = db.insertSession({
        startTime: new Date('2025-01-01T12:00:00'),
        endTime: undefined,
        description: 'Task 2',
        state: 'working',
      });
      db.insertSessionTags(session2Id, []);

      findCommand('Task', { state: 'completed' });

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Task 1');
      expect(output).not.toContain('Task 2');

      console.log = originalLog;
    });
  });

  describe('error cases', () => {
    it('should error on empty query', () => {
      const originalError = console.error;
      console.error = jest.fn();

      findCommand('', {});

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Query cannot be empty'));

      console.error = originalError;
    });

    it('should error on whitespace-only query', () => {
      const originalError = console.error;
      console.error = jest.fn();

      findCommand('   ', {});

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Query cannot be empty'));

      console.error = originalError;
    });

    it('should show friendly message when no results found', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test session
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Task 1',
        state: 'completed',
      });
      db.insertSessionTags(sessionId, []);

      findCommand('NonexistentTask', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No sessions found'));

      console.log = originalLog;
    });

    it('should error on invalid --from date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      findCommand('Task', { from: 'invalid-date' });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error parsing --from date'));

      console.error = originalError;
    });

    it('should error on invalid --to date', () => {
      const originalError = console.error;
      console.error = jest.fn();

      findCommand('Task', { to: 'invalid-date' });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error parsing --to date'));

      console.error = originalError;
    });
  });

  describe('output formatting', () => {
    it('should display sessions in table format', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test session
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Test task',
        project: 'myProject',
        state: 'completed',
      });
      db.insertSessionTags(sessionId, ['code']);

      findCommand('Test', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Search results');
      expect(output).toContain('Found 1 session');
      expect(output).toContain('Test task');
      expect(output).toContain('myProject');
      expect(output).toContain('code');

      console.log = originalLog;
    });

    it('should show search criteria in header', () => {
      const originalLog = console.log;
      console.log = jest.fn();

      // Insert test session
      const sessionId = db.insertSession({
        startTime: new Date('2025-01-01T10:00:00'),
        endTime: new Date('2025-01-01T11:00:00'),
        description: 'Test task',
        project: 'projectA',
        state: 'completed',
      });
      db.insertSessionTags(sessionId, ['code']);

      findCommand('@projectA +code Test', {});

      expect(mockExit).not.toHaveBeenCalledWith(1);
      const output = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Search results');
      expect(output).toContain('Test');
      expect(output).toContain('projectA');
      expect(output).toContain('code');

      console.log = originalLog;
    });
  });
});
