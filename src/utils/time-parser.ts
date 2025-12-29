import * as chrono from 'chrono-node';
import { subMinutes } from 'date-fns';
import { parseDuration } from '../parser/duration';

/**
 * Parse a time string that can be in various formats:
 * - Time only: "15:51" (assumes today, or yesterday if that would be in the future)
 * - Full datetime: "2025-12-29 15:51" or "2025-12-29T15:51"
 * - Relative: "-30m", "-2h", "-1h30m" (relative to now)
 *
 * Returns a Date object or throws an error if parsing fails
 */
export function parseAtTime(input: string, referenceDate: Date = new Date()): Date {
  const trimmed = input.trim();

  // Handle relative time format: -30m, -2h, -1h30m
  if (trimmed.match(/^-\d+[hm]/)) {
    try {
      const durationMinutes = parseDuration(trimmed.substring(1)); // Remove the leading '-'
      return subMinutes(referenceDate, durationMinutes);
    } catch (error) {
      throw new Error(`Invalid relative time format: "${input}". Use formats like "-30m", "-2h", "-1h30m"`);
    }
  }

  // Try parsing with chrono-node for various date/time formats
  const parsed = chrono.parseDate(trimmed, referenceDate, { forwardDate: false });

  if (parsed) {
    // If the parsed time is in the future (more than 1 minute ahead),
    // it's likely we need to interpret it as yesterday
    if (parsed.getTime() > referenceDate.getTime() + 60000) {
      // Check if this looks like a time-only format
      if (trimmed.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
        // Parse again as time yesterday
        const yesterday = new Date(referenceDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const reparsed = chrono.parseDate(trimmed, yesterday);
        if (reparsed) {
          return reparsed;
        }
      }
    }
    return parsed;
  }

  throw new Error(
    `Unable to parse time: "${input}". Use formats like "15:51", "2025-12-29 15:51", or "-30m"`
  );
}

/**
 * Validate that a parsed time is not in the future
 */
export function validateNotFuture(time: Date, referenceDate: Date = new Date()): void {
  if (time.getTime() > referenceDate.getTime()) {
    throw new Error(`Time cannot be in the future: ${time.toLocaleString()}`);
  }
}

/**
 * Validate that end time is after start time
 */
export function validateTimeOrder(startTime: Date, endTime: Date): void {
  if (endTime.getTime() <= startTime.getTime()) {
    throw new Error(
      `End time (${endTime.toLocaleString()}) must be after start time (${startTime.toLocaleString()})`
    );
  }
}
