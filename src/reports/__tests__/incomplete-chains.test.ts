import { calculateIncompleteChains } from '../calculators/incomplete-chains';
import { SessionWithTags } from '../types';

describe('calculateIncompleteChains', () => {
  it('should return empty array when no sessions', () => {
    const result = calculateIncompleteChains([]);
    expect(result).toEqual([]);
  });

  it('should return empty array when no incomplete chains', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task A',
        state: 'completed',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:00:00'),
        description: 'Task B',
        state: 'completed',
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);
    expect(result).toEqual([]);
  });

  it('should detect incomplete chain with paused session', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Feature work',
        estimateMinutes: 240,
        state: 'paused',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:00:00'),
        description: 'Feature work',
        state: 'paused',
        continuesSessionId: 1,
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(1);
    expect(result[0].rootSession.id).toBe(1);
    expect(result[0].sessions).toHaveLength(2);
    expect(result[0].incompleteSessions).toHaveLength(2);
    expect(result[0].totalMinutes).toBe(120); // 1h + 1h
    expect(result[0].estimateMinutes).toBe(240);
  });

  it('should detect incomplete chain with active session', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'completed',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Task',
        state: 'working',
        continuesSessionId: 1,
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(1);
    expect(result[0].incompleteSessions).toHaveLength(1);
    expect(result[0].incompleteSessions[0].state).toBe('working');
    expect(result[0].totalMinutes).toBe(60); // Only completed session counts
  });

  it('should handle multiple incomplete chains', () => {
    const sessions: SessionWithTags[] = [
      // Chain 1 - paused
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task A',
        state: 'paused',
        tags: ['code'],
      },
      // Chain 2 - active
      {
        id: 2,
        startTime: new Date('2025-01-15T10:00:00'),
        description: 'Task B',
        state: 'working',
        tags: ['code'],
      },
      // Chain 3 - completed (should not appear)
      {
        id: 3,
        startTime: new Date('2025-01-15T11:00:00'),
        endTime: new Date('2025-01-15T12:00:00'),
        description: 'Task C',
        state: 'completed',
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(2);
    expect(result.some((c) => c.rootSession.description === 'Task A')).toBe(true);
    expect(result.some((c) => c.rootSession.description === 'Task B')).toBe(true);
    expect(result.some((c) => c.rootSession.description === 'Task C')).toBe(false);
  });

  it('should sort by most recent incomplete session', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Old task',
        state: 'paused',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T14:00:00'),
        endTime: new Date('2025-01-15T15:00:00'),
        description: 'Recent task',
        state: 'paused',
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(2);
    expect(result[0].rootSession.description).toBe('Recent task');
    expect(result[1].rootSession.description).toBe('Old task');
  });

  it('should skip interruptions (child sessions)', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T10:00:00'),
        description: 'Main task',
        state: 'paused',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T09:00:00'),
        endTime: new Date('2025-01-15T09:15:00'),
        description: 'Interruption',
        state: 'completed',
        parentSessionId: 1,
        tags: ['meeting'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(1);
    expect(result[0].sessions).toHaveLength(1); // Interruption not included in chain
    expect(result[0].sessions[0].description).toBe('Main task');
  });

  it('should include estimate from root session', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        estimateMinutes: 180,
        state: 'paused',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:00:00'),
        description: 'Task',
        state: 'paused',
        continuesSessionId: 1,
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(1);
    expect(result[0].estimateMinutes).toBe(180);
  });

  it('should handle chains with no estimate', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'paused',
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(1);
    expect(result[0].estimateMinutes).toBeUndefined();
  });

  it('should count only completed sessions in total minutes', () => {
    const sessions: SessionWithTags[] = [
      {
        id: 1,
        startTime: new Date('2025-01-15T08:00:00'),
        endTime: new Date('2025-01-15T09:00:00'),
        description: 'Task',
        state: 'completed',
        tags: ['code'],
      },
      {
        id: 2,
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:00:00'),
        description: 'Task',
        state: 'paused',
        continuesSessionId: 1,
        tags: ['code'],
      },
      {
        id: 3,
        startTime: new Date('2025-01-15T12:00:00'),
        description: 'Task', // No end time - active
        state: 'working',
        continuesSessionId: 1,
        tags: ['code'],
      },
    ];

    const result = calculateIncompleteChains(sessions);

    expect(result).toHaveLength(1);
    // Should count sessions 1 and 2 (both have end times), but not 3
    expect(result[0].totalMinutes).toBe(120);
    expect(result[0].incompleteSessions).toHaveLength(2); // Sessions 2 and 3
  });
});
