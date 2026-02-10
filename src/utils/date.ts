import { startOfISOWeek, endOfISOWeek, format, getISOWeek, getYear } from 'date-fns';
import * as chrono from 'chrono-node';
import { formatDate as fmtDate, formatDateRange as fmtDateRange } from './format-date';

/**
 * Get the start and end of a week
 * Week starts on Monday (ISO week)
 */
export function getWeekBounds(weekSpec: string, referenceDate: Date = new Date()): { start: Date; end: Date; label: string } {
  let start: Date;
  let end: Date;
  let label: string;

  if (weekSpec === 'current') {
    start = startOfISOWeek(referenceDate);
    end = endOfISOWeek(referenceDate);
    const weekNum = getISOWeek(start);
    const year = getYear(start);
    label = `Week of ${fmtDate(start)} (${year}-W${weekNum})`;
  } else if (weekSpec === 'last') {
    const lastWeek = new Date(referenceDate);
    lastWeek.setDate(lastWeek.getDate() - 7);
    start = startOfISOWeek(lastWeek);
    end = endOfISOWeek(lastWeek);
    const weekNum = getISOWeek(start);
    const year = getYear(start);
    label = `Week of ${fmtDate(start)} (${year}-W${weekNum})`;
  } else if (weekSpec.match(/^\d{4}-W\d{1,2}$/)) {
    // ISO week format: 2024-W51
    const [year, week] = weekSpec.split('-W');
    const yearNum = parseInt(year, 10);
    const weekNum = parseInt(week, 10);

    // Calculate the first day of the year
    const jan4 = new Date(yearNum, 0, 4);
    const firstMonday = startOfISOWeek(jan4);

    // Add weeks
    start = new Date(firstMonday);
    start.setDate(start.getDate() + (weekNum - 1) * 7);
    end = endOfISOWeek(start);
    label = `Week of ${fmtDate(start)} (${weekSpec})`;
  } else {
    throw new Error(`Invalid week specification: ${weekSpec}. Use "current", "last", or ISO week format (e.g., "2024-W51")`);
  }

  return { start, end, label };
}

/**
 * Format a date range for display
 */
export function formatDateRange(start: Date, end: Date): string {
  return fmtDateRange(start, end);
}

/**
 * Get the date key for grouping by day
 */
export function getDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse a date string that can be either:
 * - ISO format (YYYY-MM-DD)
 * - Natural language (e.g., "yesterday", "monday", "last week", "3 days ago")
 *
 * Returns a Date object or throws an error if parsing fails
 */
export function parseFuzzyDate(input: string, referenceDate: Date = new Date()): Date {
  // First, try ISO date format (YYYY-MM-DD) for backward compatibility
  const isoMatch = input.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoMatch) {
    // Parse as local date (not UTC) to avoid timezone issues
    const [year, month, day] = input.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Try natural language parsing with chrono-node
  const parsed = chrono.parseDate(input, referenceDate);

  if (parsed) {
    return parsed;
  }

  // If all parsing attempts fail, throw an error
  throw new Error(`Unable to parse date: "${input}". Try formats like "YYYY-MM-DD", "yesterday", "monday", "last week", etc.`);
}
