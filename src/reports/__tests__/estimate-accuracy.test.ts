import { calculateEstimateAccuracy } from '../calculators/estimate-accuracy';
import { SessionWithTags } from '../types';

describe('calculateEstimateAccuracy', () => {
  describe('basic estimate accuracy', () => {
    it('should calculate accuracy for single estimated session', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:30:00'),
          description: 'Task 1',
          estimateMinutes: 60,
          state: 'completed',
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();
      expect(result!.averageErrorPercent).toBeCloseTo(50, 0); // 90 actual vs 60 estimate = 50% over
      expect(result!.totalEstimated).toBe(60);
      expect(result!.totalActual).toBe(90);
    });

    it('should return null if no estimated sessions', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:30:00'),
          description: 'Task 1',
          state: 'completed',
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);
      expect(result).toBeNull();
    });

    it('should skip sessions without end times', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'Task 1',
          estimateMinutes: 60,
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T11:00:00'),
          description: 'Task 2',
          estimateMinutes: 120,
          state: 'working',
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();
      expect(result!.totalEstimated).toBe(60); // Only completed session
    });
  });

  describe('continuation chain aggregation', () => {
    it('should aggregate continuation chain actual time', () => {
      const sessions: SessionWithTags[] = [
        // First session in chain - has estimate
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Feature work',
          project: 'project',
          estimateMinutes: 240, // 4 hours estimated
          state: 'paused',
          tags: ['code'],
        },
        // Interruption (break)
        {
          id: 2,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T09:15:00'),
          description: 'Break',
          state: 'completed',
          tags: ['break'],
        },
        // Second session in chain - continues first
        {
          id: 3,
          startTime: new Date('2024-01-15T09:15:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'Feature work',
          project: 'project',
          state: 'paused',
          continuesSessionId: 1,
          tags: ['code'],
        },
        // Another interruption (lunch)
        {
          id: 4,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T12:00:00'),
          description: 'Lunch',
          state: 'completed',
          tags: ['lunch'],
        },
        // Third session in chain - continues second
        {
          id: 5,
          startTime: new Date('2024-01-15T12:00:00'),
          endTime: new Date('2024-01-15T13:30:00'),
          description: 'Feature work',
          project: 'project',
          state: 'completed',
          continuesSessionId: 3,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();

      // Chain has: 1h + 1h45m + 1h30m = 4h15m = 255 minutes actual
      // Estimate: 240 minutes (from first session)
      // Error: 15 minutes over = 6.25%
      expect(result!.totalEstimated).toBe(240);
      expect(result!.totalActual).toBe(255);
      expect(result!.averageErrorPercent).toBeCloseTo(6.25, 1);
    });

    it('should use first session estimate for entire chain', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Task',
          estimateMinutes: 120,
          state: 'paused',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'Task',
          state: 'completed',
          continuesSessionId: 1,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();
      expect(result!.totalEstimated).toBe(120); // From first session
      expect(result!.totalActual).toBe(120); // 60 + 60
    });

    it('should skip chain if first session has no estimate', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Task',
          state: 'paused',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'Task',
          state: 'completed',
          continuesSessionId: 1,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);
      expect(result).toBeNull();
    });

    it('should skip chain if any session lacks end time', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Task',
          estimateMinutes: 180,
          state: 'paused',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          description: 'Task', // No end time - still working
          state: 'working',
          continuesSessionId: 1,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);
      expect(result).toBeNull();
    });

    it('should handle multiple independent continuation chains', () => {
      const sessions: SessionWithTags[] = [
        // Chain 1
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Task A',
          estimateMinutes: 120,
          state: 'paused',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'Task A',
          state: 'completed',
          continuesSessionId: 1,
          tags: ['code'],
        },
        // Chain 2
        {
          id: 3,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T12:00:00'),
          description: 'Task B',
          estimateMinutes: 60,
          state: 'paused',
          tags: ['code'],
        },
        {
          id: 4,
          startTime: new Date('2024-01-15T13:00:00'),
          endTime: new Date('2024-01-15T14:00:00'),
          description: 'Task B',
          state: 'completed',
          continuesSessionId: 3,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();

      // Chain 1: 120 estimated, 120 actual (60 + 60)
      // Chain 2: 60 estimated, 120 actual (60 + 60)
      // Total: 180 estimated, 240 actual
      expect(result!.totalEstimated).toBe(180);
      expect(result!.totalActual).toBe(240);
    });

    it('should handle standalone sessions mixed with chains', () => {
      const sessions: SessionWithTags[] = [
        // Standalone session
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Standalone',
          estimateMinutes: 60,
          state: 'completed',
          tags: ['code'],
        },
        // Chain
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'Chain task',
          estimateMinutes: 120,
          state: 'paused',
          tags: ['code'],
        },
        {
          id: 3,
          startTime: new Date('2024-01-15T12:00:00'),
          endTime: new Date('2024-01-15T13:00:00'),
          description: 'Chain task',
          state: 'completed',
          continuesSessionId: 2,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();

      // Standalone: 60 estimated, 60 actual
      // Chain: 120 estimated, 120 actual (60 + 60)
      // Total: 180 estimated, 180 actual = perfect accuracy
      expect(result!.totalEstimated).toBe(180);
      expect(result!.totalActual).toBe(180);
      expect(result!.averageErrorPercent).toBe(0);
    });
  });

  describe('continuation chain with interruptions', () => {
    it('should calculate net duration excluding interruptions', () => {
      const sessions: SessionWithTags[] = [
        // First session in chain
        {
          id: 1,
          startTime: new Date('2024-01-15T08:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'Feature work',
          estimateMinutes: 180,
          state: 'paused',
          tags: ['code'],
        },
        // Interruption of first session
        {
          id: 2,
          startTime: new Date('2024-01-15T08:30:00'),
          endTime: new Date('2024-01-15T09:00:00'),
          description: 'Question from colleague',
          parentSessionId: 1,
          state: 'completed',
          tags: ['meeting'],
        },
        // Second session in chain
        {
          id: 3,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T12:00:00'),
          description: 'Feature work',
          state: 'completed',
          continuesSessionId: 1,
          tags: ['code'],
        },
      ];

      const result = calculateEstimateAccuracy(sessions);

      expect(result).not.toBeNull();

      // Session 1: 120 minutes gross - 30 minutes interruption = 90 net
      // Session 3: 60 minutes net
      // Total actual: 150 minutes
      // Estimate: 180 minutes
      // Under by 30 minutes = 16.67% under
      expect(result!.totalEstimated).toBe(180);
      expect(result!.totalActual).toBe(150);
    });
  });
});
