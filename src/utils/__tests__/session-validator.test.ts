import {
  validateStartTime,
  validateStopTime,
  validateInterruptTime,
  validateResumeTime,
} from '../session-validator';
import { TimeTrackerDB } from '../../db/database';

// Mock the time-parser module
jest.mock('../time-parser', () => ({
  parseAtTime: jest.fn((time: string | undefined) => {
    if (!time) return new Date('2025-12-29T15:30:00.000Z');
    if (time === '-30m') return new Date('2025-12-29T15:00:00.000Z');
    if (time === '14:30') return new Date('2025-12-29T14:30:00.000Z');
    if (time === '16:00') return new Date('2025-12-29T16:00:00.000Z');
    if (time === '09:00') return new Date('2025-12-29T09:00:00.000Z');
    if (time === '10:00') return new Date('2025-12-29T10:00:00.000Z');
    throw new Error('Unable to parse time');
  }),
  validateNotFuture: jest.fn((time: Date) => {
    const now = new Date('2025-12-29T15:30:00.000Z');
    if (time.getTime() > now.getTime()) {
      throw new Error(`Time cannot be in the future: ${time.toLocaleString()}`);
    }
  }),
  validateTimeOrder: jest.fn((startTime: Date, endTime: Date) => {
    if (endTime.getTime() <= startTime.getTime()) {
      throw new Error(
        `End time (${endTime.toLocaleString()}) must be after start time (${startTime.toLocaleString()})`
      );
    }
  }),
}));

describe('validateStartTime', () => {
  let mockDb: jest.Mocked<TimeTrackerDB>;

  beforeEach(() => {
    mockDb = {
      hasOverlappingSession: jest.fn(),
    } as any;
  });

  it('should return current time when no --at flag provided', () => {
    mockDb.hasOverlappingSession.mockReturnValue(false);

    const result = validateStartTime(undefined, mockDb);

    // Result should be close to current time (within 1 second)
    const now = new Date();
    const diff = Math.abs(result.getTime() - now.getTime());
    expect(diff).toBeLessThan(1000);
    expect(mockDb.hasOverlappingSession).toHaveBeenCalledWith(result, null);
  });

  it('should parse and validate time from --at flag', () => {
    mockDb.hasOverlappingSession.mockReturnValue(false);

    const result = validateStartTime('-30m', mockDb);

    expect(result).toEqual(new Date('2025-12-29T15:00:00.000Z'));
    expect(mockDb.hasOverlappingSession).toHaveBeenCalledWith(result, null);
  });

  it('should throw error if time overlaps with existing session', () => {
    mockDb.hasOverlappingSession.mockReturnValue(true);

    expect(() => validateStartTime('14:30', mockDb)).toThrow(
      'Cannot start session'
    );
    expect(() => validateStartTime('14:30', mockDb)).toThrow(
      'would overlap with an existing session'
    );
  });

  it('should throw error for future time', () => {
    // The mock will throw for future times
    expect(() => validateStartTime('16:00', mockDb)).toThrow(
      'Time cannot be in the future'
    );
  });
});

describe('validateStopTime', () => {
  const mockSession = {
    id: 1,
    startTime: new Date('2025-12-29T14:00:00.000Z'),
    description: 'Test task',
    state: 'working' as const,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should return current time when no --at flag provided', () => {
    const result = validateStopTime(undefined, mockSession);

    // Result should be close to current time (within 1 second)
    const now = new Date();
    const diff = Math.abs(result.getTime() - now.getTime());
    expect(diff).toBeLessThan(1000);
  });

  it('should parse and validate time from --at flag', () => {
    const result = validateStopTime('-30m', mockSession);

    expect(result).toEqual(new Date('2025-12-29T15:00:00.000Z'));
  });

  it('should throw error if stop time is before start time', () => {
    // Session started at 14:00, trying to stop at 09:00
    expect(() => validateStopTime('09:00', mockSession)).toThrow(
      'must be after start time'
    );
  });

  it('should throw error for future time', () => {
    expect(() => validateStopTime('16:00', mockSession)).toThrow(
      'Time cannot be in the future'
    );
  });

  it('should allow stop time after start time', () => {
    const laterSession = {
      ...mockSession,
      startTime: new Date('2025-12-29T10:00:00.000Z'),
    };

    const result = validateStopTime('14:30', laterSession);
    expect(result).toEqual(new Date('2025-12-29T14:30:00.000Z'));
  });
});

describe('validateInterruptTime', () => {
  let mockDb: jest.Mocked<TimeTrackerDB>;

  const mockSession = {
    id: 1,
    startTime: new Date('2025-12-29T14:00:00.000Z'),
    description: 'Main task',
    state: 'working' as const,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockDb = {
      hasOverlappingSession: jest.fn(),
    } as any;
  });

  it('should return current time when no --at flag provided', () => {
    mockDb.hasOverlappingSession.mockReturnValue(false);

    const result = validateInterruptTime(undefined, mockSession, mockDb);

    // Result should be close to current time (within 1 second)
    const now = new Date();
    const diff = Math.abs(result.getTime() - now.getTime());
    expect(diff).toBeLessThan(1000);
  });

  it('should parse and validate time from --at flag', () => {
    mockDb.hasOverlappingSession.mockReturnValue(false);

    const result = validateInterruptTime('-30m', mockSession, mockDb);

    expect(result).toEqual(new Date('2025-12-29T15:00:00.000Z'));
  });

  it('should throw error if interrupt time is before active session start', () => {
    // Session started at 14:00, trying to interrupt at 09:00
    expect(() => validateInterruptTime('09:00', mockSession, mockDb)).toThrow(
      'must be after start time'
    );
  });

  it('should throw error if time overlaps with another session', () => {
    mockDb.hasOverlappingSession.mockReturnValue(true);

    expect(() => validateInterruptTime('14:30', mockSession, mockDb)).toThrow(
      'Cannot start interruption'
    );
    expect(() => validateInterruptTime('14:30', mockSession, mockDb)).toThrow(
      'would overlap with an existing session'
    );
  });

  it('should exclude active session from overlap check', () => {
    mockDb.hasOverlappingSession.mockReturnValue(false);

    validateInterruptTime('14:30', mockSession, mockDb);

    expect(mockDb.hasOverlappingSession).toHaveBeenCalledWith(
      new Date('2025-12-29T14:30:00.000Z'),
      null,
      1 // Active session ID should be excluded
    );
  });

  it('should throw error for future time', () => {
    expect(() => validateInterruptTime('16:00', mockSession, mockDb)).toThrow(
      'Time cannot be in the future'
    );
  });
});

describe('validateResumeTime', () => {
  const mockSession = {
    id: 2,
    startTime: new Date('2025-12-29T14:30:00.000Z'),
    description: 'Interruption task',
    state: 'working' as const,
    parentSessionId: 1,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should return current time when no --at flag provided', () => {
    const result = validateResumeTime(undefined, mockSession);

    // Result should be close to current time (within 1 second)
    const now = new Date();
    const diff = Math.abs(result.getTime() - now.getTime());
    expect(diff).toBeLessThan(1000);
  });

  it('should parse and validate time from --at flag', () => {
    const result = validateResumeTime('-30m', mockSession);

    expect(result).toEqual(new Date('2025-12-29T15:00:00.000Z'));
  });

  it('should throw error if resume time is before interruption start', () => {
    // Interruption started at 14:30, trying to resume at 09:00
    expect(() => validateResumeTime('09:00', mockSession)).toThrow(
      'must be after start time'
    );
  });

  it('should throw error for future time', () => {
    expect(() => validateResumeTime('16:00', mockSession)).toThrow(
      'Time cannot be in the future'
    );
  });

  it('should allow resume time after interruption start', () => {
    const result = validateResumeTime('14:30', {
      ...mockSession,
      startTime: new Date('2025-12-29T10:00:00.000Z'),
    });

    expect(result).toEqual(new Date('2025-12-29T14:30:00.000Z'));
  });
});
