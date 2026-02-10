/**
 * User configuration schema
 * Stored in ~/.config/tt/config.json
 */

export interface UserConfig {
  /**
   * Week start day for week-based reports
   * @default "monday"
   */
  weekStartDay?: 'monday' | 'sunday';

  /**
   * Default output format for report command
   * @default "terminal"
   */
  reportFormat?: 'terminal' | 'json' | 'csv';

  /**
   * Default output format for list command
   * @default "table"
   */
  listFormat?: 'table' | 'log';

  /**
   * Time display format
   * @default "24h"
   */
  timeFormat?: '24h' | '12h';

  /**
   * Date format string (date-fns format, with year)
   * @default "MMM d, yyyy"
   */
  dateFormat?: string;

  /**
   * Short date format string (date-fns format, without year)
   * @default "MMM d"
   */
  dateFormatShort?: string;

  /**
   * Locale for date formatting (date-fns locale name, e.g. "de", "fr", "en-GB")
   * Empty string means auto-detect from system
   * @default ""
   */
  locale?: string;

  /**
   * Editor command for editing files (overrides $EDITOR)
   * @default Uses $EDITOR, $VISUAL, or "vi"
   */
  editor?: string;

  /**
   * Churn task scheduler integration
   */
  churn?: {
    /**
     * Enable churn scheduler for task management
     * @default false
     */
    enabled?: boolean;
    /**
     * Path to churn database file
     * @default "~/.config/churn/churn.db"
     */
    db_path?: string;
  };
}

export const DEFAULT_CONFIG: UserConfig & { weekStartDay: 'monday' | 'sunday'; reportFormat: 'terminal' | 'json' | 'csv'; listFormat: 'table' | 'log'; timeFormat: '24h' | '12h'; dateFormat: string; dateFormatShort: string; locale: string; editor: string } = {
  weekStartDay: 'monday',
  reportFormat: 'terminal',
  listFormat: 'table',
  timeFormat: '24h',
  dateFormat: 'MMM d, yyyy',
  dateFormatShort: 'MMM d',
  locale: '',
  editor: '', // Will use getEditor() fallback
  // churn is undefined by default (not enabled)
};

export const VALID_CONFIG_KEYS = [
  'weekStartDay',
  'reportFormat',
  'listFormat',
  'timeFormat',
  'dateFormat',
  'dateFormatShort',
  'locale',
  'editor',
  'churn.enabled',
  'churn.db_path',
] as const;

export type ConfigKey = typeof VALID_CONFIG_KEYS[number];
