import * as fs from 'fs';
import * as readline from 'readline';

// Set up test database path - use fixed path for this test file
const testDbPath = '/tmp/tt-test-delete-cmd/test.db';
const testDataDir = '/tmp/tt-test-delete-cmd';

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
    const testDbPath = '/tmp/tt-test-delete-cmd/test.db';
    const testDataDir = '/tmp/tt-test-delete-cmd';

    return {
        getDatabasePath: jest.fn(() => testDbPath),
        ensureDataDir: jest.fn(() => {
            if (!fs.existsSync(testDataDir)) {
                fs.mkdirSync(testDataDir, { recursive: true });
            }
        }),
    };
});

// Mock readline for confirmation prompts
jest.mock('readline', () => {
    const original = jest.requireActual('readline');
    return {
        ...original,
        createInterface: jest.fn(() => ({
            question: jest.fn((_, callback) => callback('n')), // Default to 'no'
            close: jest.fn(),
        })),
    };
});

import { deleteCommand } from '../delete';
import { TimeTrackerDB } from '../../../db/database';

describe('delete command', () => {
    let db: TimeTrackerDB;
    let mockReadline: any;

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

        // Set up readline mock
        mockReadline = {
            question: jest.fn((_, callback) => callback('n')),
            close: jest.fn(),
        };
        (readline.createInterface as jest.Mock).mockReturnValue(mockReadline);

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

    describe('single session deletion', () => {
        test('should delete a single session by ID with --yes flag', async () => {
            // Create a test session
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Test session',
                project: 'testProject',
                state: 'completed',
            });

            db.insertSessionTags(sessionId, ['tag1', 'tag2']);

            // Delete with --yes flag (no confirmation)
            await deleteCommand(sessionId.toString(), { yes: true });

            // Reopen to check
            reopenDb();

            // Session should be gone
            const session = db.getSessionById(sessionId);
            expect(session).toBeNull();

            // Should not have prompted for confirmation
            expect(mockReadline.question).not.toHaveBeenCalled();
        });

        test('should delete a single session with --yes flag', async () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Test session',
                state: 'completed',
            });

            await deleteCommand(sessionId.toString(), { yes: true });

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session).toBeNull();
        });

        test('should prompt for confirmation when no --yes flag', async () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Test session',
                state: 'completed',
            });

            // Mock user saying 'no'
            mockReadline.question.mockImplementation((_: any, callback: any) => callback('n'));

            await deleteCommand(sessionId.toString(), {});

            // Should have prompted
            expect(mockReadline.question).toHaveBeenCalled();

            // Should have exited without deleting
            expect(mockExit).toHaveBeenCalledWith(0);

            reopenDb();

            // Session should still exist
            const session = db.getSessionById(sessionId);
            expect(session).not.toBeNull();
        });

        test('should delete when user confirms', async () => {
            const sessionId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Test session',
                state: 'completed',
            });

            // Mock user saying 'yes'
            mockReadline.question.mockImplementation((_: any, callback: any) => callback('y'));

            await deleteCommand(sessionId.toString(), {});

            reopenDb();

            const session = db.getSessionById(sessionId);
            expect(session).toBeNull();
        });

        test('should error on invalid session ID', async () => {
            await deleteCommand('invalid', { yes: true });

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should error on non-existent session ID', async () => {
            await deleteCommand('9999', { yes: true });

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should cascade delete child sessions', async () => {
            // Create parent session
            const parentId = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Parent task',
                state: 'paused',
            });

            // Create child (interruption)
            const childId = db.insertSession({
                startTime: new Date('2024-01-15T09:30:00'),
                endTime: new Date('2024-01-15T09:45:00'),
                description: 'Interruption',
                state: 'completed',
                parentSessionId: parentId,
            });

            // Delete parent
            await deleteCommand(parentId.toString(), { yes: true });

            reopenDb();

            // Both should be gone
            expect(db.getSessionById(parentId)).toBeNull();
            expect(db.getSessionById(childId)).toBeNull();
        });
    });

    describe('multiple session deletion', () => {
        test('should delete multiple sessions by ID', async () => {
            const id1 = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Session 1',
                state: 'completed',
            });

            const id2 = db.insertSession({
                startTime: new Date('2024-01-15T10:00:00'),
                endTime: new Date('2024-01-15T11:00:00'),
                description: 'Session 2',
                state: 'completed',
            });

            const id3 = db.insertSession({
                startTime: new Date('2024-01-15T11:00:00'),
                endTime: new Date('2024-01-15T12:00:00'),
                description: 'Session 3',
                state: 'completed',
            });

            await deleteCommand([id1.toString(), id3.toString()], { yes: true });

            reopenDb();

            expect(db.getSessionById(id1)).toBeNull();
            expect(db.getSessionById(id2)).not.toBeNull(); // Should still exist
            expect(db.getSessionById(id3)).toBeNull();
        });

        test('should warn about invalid IDs but delete valid ones', async () => {
            const id1 = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Session 1',
                state: 'completed',
            });

            await deleteCommand([id1.toString(), '9999'], { yes: true });

            reopenDb();

            // Valid session should be deleted
            expect(db.getSessionById(id1)).toBeNull();
        });

        test('should error if all provided IDs are invalid', async () => {
            await deleteCommand(['9999', '8888'], { yes: true });

            expect(mockExit).toHaveBeenCalledWith(1);
        });
    });

    describe('filter-based deletion', () => {
        beforeEach(() => {
            // Create test sessions across multiple days and projects
            db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                endTime: new Date('2024-01-15T10:00:00'),
                description: 'Monday work',
                project: 'projectA',
                state: 'completed',
            });

            const id2 = db.insertSession({
                startTime: new Date('2024-01-16T09:00:00'),
                endTime: new Date('2024-01-16T10:00:00'),
                description: 'Tuesday work',
                project: 'projectA',
                state: 'completed',
            });
            db.insertSessionTags(id2, ['meeting']);

            db.insertSession({
                startTime: new Date('2024-01-17T09:00:00'),
                endTime: new Date('2024-01-17T10:00:00'),
                description: 'Wednesday work',
                project: 'projectB',
                state: 'completed',
            });

            const id4 = db.insertSession({
                startTime: new Date('2024-01-18T09:00:00'),
                endTime: new Date('2024-01-18T10:00:00'),
                description: 'Thursday work',
                project: 'projectB',
                state: 'completed',
            });
            db.insertSessionTags(id4, ['meeting']);
        });

        test('should delete sessions by date range', async () => {
            await deleteCommand([], {
                from: '2024-01-16',
                to: '2024-01-17',
                yes: true,
            });

            reopenDb();

            const remaining = db.getSessionsByTimeRange(
                new Date('2024-01-01'),
                new Date('2024-01-31'),
                {}
            );

            expect(remaining.length).toBe(2); // Only Mon and Thu should remain
            expect(remaining.some((s) => s.description === 'Monday work')).toBe(true);
            expect(remaining.some((s) => s.description === 'Thursday work')).toBe(true);
        });

        test('should delete sessions by project', async () => {
            await deleteCommand([], {
                project: 'projectA',
                yes: true,
            });

            reopenDb();

            const remaining = db.getSessionsByTimeRange(
                new Date('2024-01-01'),
                new Date('2024-01-31'),
                {}
            );

            expect(remaining.length).toBe(2); // Only projectB sessions remain
            expect(remaining.every((s) => s.project === 'projectB')).toBe(true);
        });

        test('should delete sessions by tag', async () => {
            await deleteCommand([], {
                tag: 'meeting',
                yes: true,
            });

            reopenDb();

            const remaining = db.getSessionsByTimeRange(
                new Date('2024-01-01'),
                new Date('2024-01-31'),
                {}
            );

            expect(remaining.length).toBe(2); // Sessions without 'meeting' tag
            expect(remaining.some((s) => s.description === 'Monday work')).toBe(true);
            expect(remaining.some((s) => s.description === 'Wednesday work')).toBe(true);
        });

        test('should delete sessions by state', async () => {
            // Add a paused session
            db.insertSession({
                startTime: new Date('2024-01-19T09:00:00'),
                description: 'Paused work',
                state: 'paused',
            });

            await deleteCommand([], {
                state: 'paused',
                yes: true,
            });

            reopenDb();

            const remaining = db.getSessionsByTimeRange(
                new Date('2024-01-01'),
                new Date('2024-01-31'),
                {}
            );

            // All completed sessions should remain
            expect(remaining.every((s) => s.state === 'completed')).toBe(true);
        });

        test('should combine multiple filters', async () => {
            await deleteCommand([], {
                project: 'projectB',
                tag: 'meeting',
                yes: true,
            });

            reopenDb();

            const remaining = db.getSessionsByTimeRange(
                new Date('2024-01-01'),
                new Date('2024-01-31'),
                {}
            );

            // Only Thursday projectB + meeting session should be deleted
            expect(remaining.length).toBe(3);
            expect(remaining.some((s) => s.description === 'Thursday work')).toBe(false);
        });

        test('should show message when no sessions match filters', async () => {
            await deleteCommand([], {
                project: 'nonexistent',
                yes: true,
            });

            expect(mockExit).toHaveBeenCalledWith(0);
        });
    });

    describe('dry-run mode', () => {
        test('should not delete sessions in dry-run mode', async () => {
            const id1 = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Test session',
                state: 'completed',
            });

            await deleteCommand(id1.toString(), { dryRun: true });

            reopenDb();

            // Session should still exist
            const session = db.getSessionById(id1);
            expect(session).not.toBeNull();

            // Should have exited successfully
            expect(mockExit).toHaveBeenCalledWith(0);
        });

        test('should show what would be deleted with filters in dry-run', async () => {
            db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Session 1',
                project: 'testProject',
                state: 'completed',
            });

            db.insertSession({
                startTime: new Date('2024-01-15T10:00:00'),
                description: 'Session 2',
                project: 'testProject',
                state: 'completed',
            });

            await deleteCommand([], {
                project: 'testProject',
                dryRun: true,
            });

            reopenDb();

            // All sessions should still exist
            const remaining = db.getSessionsByTimeRange(
                new Date('2024-01-01'),
                new Date('2024-01-31'),
                {}
            );
            expect(remaining.length).toBe(2);
        });
    });

    describe('union of IDs and filters', () => {
        test('should delete union of session IDs and filter matches', async () => {
            const id1 = db.insertSession({
                startTime: new Date('2024-01-15T09:00:00'),
                description: 'Session 1',
                project: 'projectA',
                state: 'completed',
            });

            const id2 = db.insertSession({
                startTime: new Date('2024-01-16T09:00:00'),
                description: 'Session 2',
                project: 'projectB',
                state: 'completed',
            });

            const id3 = db.insertSession({
                startTime: new Date('2024-01-17T09:00:00'),
                description: 'Session 3',
                project: 'projectA',
                state: 'completed',
            });

            // Delete id2 (projectB) + all projectA sessions
            await deleteCommand([id2.toString()], {
                project: 'projectA',
                yes: true,
            });

            reopenDb();

            // All three should be deleted
            expect(db.getSessionById(id1)).toBeNull();
            expect(db.getSessionById(id2)).toBeNull();
            expect(db.getSessionById(id3)).toBeNull();
        });
    });

    describe('error handling', () => {
        test('should error when no IDs or filters provided', async () => {
            await deleteCommand([], {});

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should handle transaction errors gracefully', async () => {
            // Close the database to cause an error
            db.close();

            await deleteCommand('1', { yes: true });

            expect(mockExit).toHaveBeenCalledWith(1);
        });
    });
});
