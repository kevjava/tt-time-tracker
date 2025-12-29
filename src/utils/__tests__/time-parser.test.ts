import { parseAtTime, validateNotFuture, validateTimeOrder } from '../time-parser';

describe('parseAtTime', () => {
  const referenceDate = new Date('2025-12-29T15:30:00.000Z'); // 15:30 UTC

  describe('relative time format', () => {
    it('should parse -30m (30 minutes ago)', () => {
      const result = parseAtTime('-30m', referenceDate);
      const expected = new Date('2025-12-29T15:00:00.000Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should parse -2h (2 hours ago)', () => {
      const result = parseAtTime('-2h', referenceDate);
      const expected = new Date('2025-12-29T13:30:00.000Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should parse -1h30m (1 hour 30 minutes ago)', () => {
      const result = parseAtTime('-1h30m', referenceDate);
      const expected = new Date('2025-12-29T14:00:00.000Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should parse -15m (15 minutes ago)', () => {
      const result = parseAtTime('-15m', referenceDate);
      const expected = new Date('2025-12-29T15:15:00.000Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should parse -5m (5 minutes ago)', () => {
      const result = parseAtTime('-5m', referenceDate);
      const expected = new Date('2025-12-29T15:25:00.000Z');
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should throw error for invalid relative format', () => {
      expect(() => parseAtTime('-invalid', referenceDate)).toThrow(
        'Unable to parse time'
      );
    });
  });

  describe('time-only format', () => {
    it('should parse time-only format (14:30)', () => {
      const result = parseAtTime('14:30', referenceDate);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
    });

    it('should parse time-only format (09:00)', () => {
      const result = parseAtTime('09:00', referenceDate);
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(0);
    });

    it('should parse time-only format with seconds (10:30:45)', () => {
      const result = parseAtTime('10:30:45', referenceDate);
      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(45);
    });

    it('should handle time that appears to be in the future by using yesterday', () => {
      // If reference is 15:30 and we parse 16:00, it should interpret as yesterday
      const refDate = new Date('2025-12-29T15:30:00.000Z');
      const result = parseAtTime('16:00', refDate);

      // Should be more than 1 minute before reference (indicating it went to yesterday)
      expect(result.getTime()).toBeLessThan(refDate.getTime());
    });
  });

  describe('full datetime format', () => {
    it('should parse full datetime (YYYY-MM-DD HH:mm)', () => {
      const result = parseAtTime('2025-12-25 14:30', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11); // December is month 11
      expect(result.getDate()).toBe(25);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it('should parse ISO datetime (YYYY-MM-DDTHH:mm)', () => {
      const result = parseAtTime('2025-12-28T10:15', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(28);
      expect(result.getHours()).toBe(10);
      expect(result.getMinutes()).toBe(15);
    });

    it('should parse datetime with seconds', () => {
      const result = parseAtTime('2025-12-27 09:30:15', referenceDate);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(27);
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(15);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid format', () => {
      expect(() => parseAtTime('invalid', referenceDate)).toThrow(
        'Unable to parse time'
      );
    });

    it('should throw error for empty string', () => {
      expect(() => parseAtTime('', referenceDate)).toThrow(
        'Unable to parse time'
      );
    });

    it('should throw error for random text', () => {
      expect(() => parseAtTime('not a time', referenceDate)).toThrow(
        'Unable to parse time'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle leading/trailing whitespace', () => {
      const result = parseAtTime('  14:30  ', referenceDate);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it('should handle midnight (00:00)', () => {
      const result = parseAtTime('00:00', referenceDate);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it('should handle end of day (23:59)', () => {
      const result = parseAtTime('23:59', referenceDate);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });
  });
});

describe('validateNotFuture', () => {
  const referenceDate = new Date('2025-12-29T15:30:00.000Z');

  it('should not throw for past time', () => {
    const pastTime = new Date('2025-12-29T14:00:00.000Z');
    expect(() => validateNotFuture(pastTime, referenceDate)).not.toThrow();
  });

  it('should not throw for current time', () => {
    expect(() => validateNotFuture(referenceDate, referenceDate)).not.toThrow();
  });

  it('should throw for future time', () => {
    const futureTime = new Date('2025-12-29T16:00:00.000Z');
    expect(() => validateNotFuture(futureTime, referenceDate)).toThrow(
      'Time cannot be in the future'
    );
  });

  it('should throw for time far in the future', () => {
    const futureTime = new Date('2026-01-15T10:00:00.000Z');
    expect(() => validateNotFuture(futureTime, referenceDate)).toThrow(
      'Time cannot be in the future'
    );
  });
});

describe('validateTimeOrder', () => {
  it('should not throw when end time is after start time', () => {
    const startTime = new Date('2025-12-29T10:00:00.000Z');
    const endTime = new Date('2025-12-29T11:00:00.000Z');
    expect(() => validateTimeOrder(startTime, endTime)).not.toThrow();
  });

  it('should not throw when times are far apart', () => {
    const startTime = new Date('2025-12-29T09:00:00.000Z');
    const endTime = new Date('2025-12-29T17:00:00.000Z');
    expect(() => validateTimeOrder(startTime, endTime)).not.toThrow();
  });

  it('should throw when end time equals start time', () => {
    const time = new Date('2025-12-29T10:00:00.000Z');
    expect(() => validateTimeOrder(time, time)).toThrow(
      'End time'
    );
    expect(() => validateTimeOrder(time, time)).toThrow(
      'must be after start time'
    );
  });

  it('should throw when end time is before start time', () => {
    const startTime = new Date('2025-12-29T11:00:00.000Z');
    const endTime = new Date('2025-12-29T10:00:00.000Z');
    expect(() => validateTimeOrder(startTime, endTime)).toThrow(
      'must be after start time'
    );
  });

  it('should throw with descriptive message including both times', () => {
    const startTime = new Date('2025-12-29T11:00:00.000Z');
    const endTime = new Date('2025-12-29T10:00:00.000Z');

    try {
      validateTimeOrder(startTime, endTime);
      fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('End time');
      expect(error.message).toContain('start time');
    }
  });
});
