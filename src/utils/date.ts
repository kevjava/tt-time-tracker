import { startOfISOWeek, endOfISOWeek, format } from 'date-fns';

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
    label = `Week of ${format(start, 'MMM d, yyyy')}`;
  } else if (weekSpec === 'last') {
    const lastWeek = new Date(referenceDate);
    lastWeek.setDate(lastWeek.getDate() - 7);
    start = startOfISOWeek(lastWeek);
    end = endOfISOWeek(lastWeek);
    label = `Week of ${format(start, 'MMM d, yyyy')}`;
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
    label = weekSpec;
  } else {
    throw new Error(`Invalid week specification: ${weekSpec}. Use "current", "last", or ISO week format (e.g., "2024-W51")`);
  }

  return { start, end, label };
}

/**
 * Format a date range for display
 */
export function formatDateRange(start: Date, end: Date): string {
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
}

/**
 * Get the date key for grouping by day
 */
export function getDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
