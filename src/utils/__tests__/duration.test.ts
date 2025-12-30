import { getSessionDuration, getNetSessionDuration } from '../duration';

describe('duration utilities', () => {
  describe('getSessionDuration', () => {
    it('should return 0 for sessions without end time', () => {
      const session = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: undefined,
      };

      expect(getSessionDuration(session)).toBe(0);
    });

    it('should use explicit duration when provided', () => {
      const session = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T12:00:00'),
        explicitDurationMinutes: 90,
      };

      expect(getSessionDuration(session)).toBe(90);
    });

    it('should calculate duration from start and end times', () => {
      const session = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T11:30:00'),
      };

      expect(getSessionDuration(session)).toBe(150); // 2.5 hours = 150 minutes
    });
  });

  describe('getNetSessionDuration', () => {
    it('should return gross duration when no interruptions', () => {
      const session = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
      };

      const allSessions = [session];

      expect(getNetSessionDuration(session, allSessions)).toBe(120);
    });

    it('should subtract single interruption from gross duration', () => {
      const parentSession = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T12:00:00'),
      };

      const interruption = {
        id: 2,
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T10:30:00'),
        parentSessionId: 1,
      };

      const allSessions = [parentSession, interruption];

      // Gross: 3 hours (180 min), Interruption: 30 min, Net: 150 min
      expect(getNetSessionDuration(parentSession, allSessions)).toBe(150);
    });

    it('should subtract multiple interruptions from gross duration', () => {
      const parentSession = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T13:00:00'),
      };

      const interruption1 = {
        id: 2,
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T10:30:00'),
        parentSessionId: 1,
      };

      const interruption2 = {
        id: 3,
        startTime: new Date('2024-01-01T11:00:00'),
        endTime: new Date('2024-01-01T11:45:00'),
        parentSessionId: 1,
      };

      const allSessions = [parentSession, interruption1, interruption2];

      // Gross: 4 hours (240 min), Interruptions: 30 + 45 = 75 min, Net: 165 min
      expect(getNetSessionDuration(parentSession, allSessions)).toBe(165);
    });

    it('should handle explicit duration on interruptions', () => {
      const parentSession = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T12:00:00'),
      };

      const interruption = {
        id: 2,
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
        explicitDurationMinutes: 25, // Explicit duration overrides calculated
        parentSessionId: 1,
      };

      const allSessions = [parentSession, interruption];

      // Gross: 180 min, Interruption: 25 min (explicit), Net: 155 min
      expect(getNetSessionDuration(parentSession, allSessions)).toBe(155);
    });

    it('should return 0 when session has no end time', () => {
      const session = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: undefined,
      };

      const allSessions = [session];

      expect(getNetSessionDuration(session, allSessions)).toBe(0);
    });

    it('should return gross duration when session has no id', () => {
      const session = {
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
      };

      const allSessions = [session];

      expect(getNetSessionDuration(session, allSessions)).toBe(120);
    });

    it('should never return negative duration', () => {
      const parentSession = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T10:00:00'),
      };

      const interruption = {
        id: 2,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
        parentSessionId: 1,
      };

      const allSessions = [parentSession, interruption];

      // Gross: 60 min, Interruption: 120 min, Net: max(0, -60) = 0
      expect(getNetSessionDuration(parentSession, allSessions)).toBe(0);
    });

    it('should only subtract direct children, not all interruptions', () => {
      const parentSession = {
        id: 1,
        startTime: new Date('2024-01-01T09:00:00'),
        endTime: new Date('2024-01-01T12:00:00'),
      };

      const childOfParent = {
        id: 2,
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T10:30:00'),
        parentSessionId: 1,
      };

      const otherSession = {
        id: 3,
        startTime: new Date('2024-01-01T11:00:00'),
        endTime: new Date('2024-01-01T11:15:00'),
      };

      const childOfOther = {
        id: 4,
        startTime: new Date('2024-01-01T11:05:00'),
        endTime: new Date('2024-01-01T11:10:00'),
        parentSessionId: 3,
      };

      const allSessions = [parentSession, childOfParent, otherSession, childOfOther];

      // Parent session should only subtract its own child (30 min), not child of other (5 min)
      // Gross: 180 min, Own interruption: 30 min, Net: 150 min
      expect(getNetSessionDuration(parentSession, allSessions)).toBe(150);
    });
  });
});
