import { ParseError } from '../types/errors';

/**
 * Parse a duration string into minutes
 *
 * Supported formats:
 * - "2h" -> 120 minutes
 * - "30m" -> 30 minutes
 * - "1h30m" -> 90 minutes
 * - "90m" -> 90 minutes
 *
 * @param duration - Duration string to parse
 * @returns Duration in minutes
 * @throws ParseError if format is invalid
 */
export function parseDuration(duration: string): number {
  if (!duration || typeof duration !== 'string') {
    throw new ParseError('Duration cannot be empty');
  }

  const trimmed = duration.trim();
  if (trimmed.length === 0) {
    throw new ParseError('Duration cannot be empty');
  }

  const durationRegex = /^(?:(\d+)h)?(?:(\d+)m)?$/;
  const match = trimmed.match(durationRegex);

  if (!match) {
    throw new ParseError(`Invalid duration format: "${duration}"`);
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours === 0 && minutes === 0) {
    throw new ParseError(`Duration must specify hours and/or minutes: "${duration}"`);
  }

  if (hours < 0 || minutes < 0) {
    throw new ParseError(`Duration cannot be negative: "${duration}"`);
  }

  if (minutes >= 60) {
    throw new ParseError(`Minutes must be less than 60: "${duration}"`);
  }

  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes === 0) {
    throw new ParseError(`Duration cannot be zero: "${duration}"`);
  }

  return totalMinutes;
}

/**
 * Format minutes back into a human-readable duration string
 *
 * @param minutes - Total minutes
 * @returns Formatted duration string (e.g., "2h30m", "45m")
 */
export function formatDuration(minutes: number): string {
  if (minutes < 0) {
    throw new Error('Minutes cannot be negative');
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
}
