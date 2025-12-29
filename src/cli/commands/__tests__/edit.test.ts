import * as fs from 'fs';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-edit-cmd/test.db';
const testDataDir = '/tmp/tt-test-edit-cmd';

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
    const testDbPath = '/tmp/tt-test-edit-cmd/test.db';
    const testDataDir = '/tmp/tt-test-edit-cmd';

    return {
        getDatabasePath: jest.fn(() => testDbPath),
        ensureDataDir: jest.fn(() => {
            if (!fs.existsSync(testDataDir)) {
                fs.mkdirSync(testDataDir, { recursive: true });
            }
        }),
    };
});

import { editCommand } from '../edit';
import { TimeTrackerDB } from '../../../db/database';

describe('edit command', () => {
    let db: TimeTrackerDB;

    // Helper to reopen database after command execution
    const reopenDb = () => {
        db.close();
        db = new TimeTrackerDB(testDbPath);
    };

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
        if (db) {
            db.close();
        }
    });

    afterAll(() => {
        // Clean up test directory
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
    });

    describe('flag-based editing', () => {
        test('should edit session description with --description flag', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Original description',
                state: 'completed',
            });

            editCommand(sessionId.toString(), undefined, { description: 'Updated description' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session).not.toBeNull();
            expect(session!.description).toBe('Updated description');
        });

        test('should edit session project with --project flag', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                project: 'oldProject',
                state: 'completed',
            });

            editCommand(sessionId.toString(), undefined, { project: 'newProject' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.project).toBe('newProject');
        });

        test('should edit session tags with --tags flag', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            db.insertSessionTags(sessionId, ['oldTag1', 'oldTag2']);

            editCommand(sessionId.toString(), undefined, { tags: 'newTag1,newTag2,newTag3' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.tags).toEqual(['newTag1', 'newTag2', 'newTag3']);
        });

        test('should edit session estimate with --estimate flag', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                estimateMinutes: 60,
                state: 'completed',
            });

            editCommand(sessionId.toString(), undefined, { estimate: '45m' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.estimateMinutes).toBe(45);
        });
    });

    describe('log notation editing', () => {
        test('should edit session estimate with log notation ~20m', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                estimateMinutes: 60,
                state: 'completed',
            });

            editCommand(sessionId.toString(), '~20m', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.estimateMinutes).toBe(20);
        });

        test('should edit session project with log notation @newProject', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                project: 'oldProject',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '@newProject', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.project).toBe('newProject');
        });

        test('should edit session tags with log notation +tag1 +tag2', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '+tag1 +tag2', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.tags).toEqual(['tag1', 'tag2']);
        });

        test('should edit session description with log notation', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Old description',
                state: 'completed',
            });

            editCommand(sessionId.toString(), 'New description', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.description).toBe('New description');
        });

        test('should edit multiple fields with combined log notation', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Old description',
                project: 'oldProject',
                state: 'completed',
            });

            editCommand(sessionId.toString(), 'New description @newProject +tag1 +tag2 ~30m', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.description).toBe('New description');
            expect(session!.project).toBe('newProject');
            expect(session!.tags).toEqual(['tag1', 'tag2']);
            expect(session!.estimateMinutes).toBe(30);
        });

        test('should edit start time with log notation timestamp', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '10:30', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            const expectedTime = new Date('2024-01-15T10:30:00');
            expect(session!.startTime.getHours()).toBe(expectedTime.getHours());
            expect(session!.startTime.getMinutes()).toBe(expectedTime.getMinutes());
        });

        test('should set end time with explicit duration (45m)', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '(45m)', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.endTime).not.toBeNull();
            const expectedEnd = new Date('2024-01-15T09:45:00');
            expect(session!.endTime!.getTime()).toBe(expectedEnd.getTime());
        });

        test('should update end time based on new start time and explicit duration', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '10:00 (30m)', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.startTime.getHours()).toBe(10);
            expect(session!.startTime.getMinutes()).toBe(0);
            expect(session!.endTime).not.toBeNull();
            expect(session!.endTime!.getHours()).toBe(10);
            expect(session!.endTime!.getMinutes()).toBe(30);
        });
    });

    describe('flags override log notation', () => {
        test('should use flag project over log notation project', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '@logProject', { project: 'flagProject' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.project).toBe('flagProject');
        });

        test('should use flag estimate over log notation estimate', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '~30m', { estimate: '1h' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.estimateMinutes).toBe(60);
        });

        test('should use flag tags over log notation tags', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '+logTag1 +logTag2', { tags: 'flagTag1,flagTag2' });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.tags).toEqual(['flagTag1', 'flagTag2']);
        });
    });

    describe('error handling', () => {
        test('should error on invalid session ID', () => {
            editCommand('invalid', undefined, { description: 'test' });

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should error on non-existent session ID', () => {
            editCommand('9999', undefined, { description: 'test' });

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should error when no updates provided', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), undefined, {});

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should error on invalid estimate format', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test task',
                state: 'completed',
            });

            editCommand(sessionId.toString(), undefined, { estimate: 'invalid' });

            expect(mockExit).toHaveBeenCalledWith(1);
        });
    });

    describe('preserves unchanged fields', () => {
        test('should not change fields not mentioned in log notation', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Original description',
                project: 'originalProject',
                estimateMinutes: 60,
                state: 'completed',
            });

            db.insertSessionTags(sessionId, ['originalTag']);

            // Only update estimate
            editCommand(sessionId.toString(), '~45m', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.description).toBe('Original description');
            expect(session!.project).toBe('originalProject');
            expect(session!.tags).toEqual(['originalTag']);
            expect(session!.estimateMinutes).toBe(45); // Changed
        });

        test('should not change description when log notation has no description', () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Original description',
                state: 'completed',
            });

            editCommand(sessionId.toString(), '@newProject ~30m', {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session!.description).toBe('Original description'); // Unchanged
            expect(session!.project).toBe('newProject');
            expect(session!.estimateMinutes).toBe(30);
        });
    });
});
