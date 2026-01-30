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

export const DEFAULT_CONFIG: UserConfig & { weekStartDay: 'monday' | 'sunday'; reportFormat: 'terminal' | 'json' | 'csv'; listFormat: 'table' | 'log'; timeFormat: '24h' | '12h'; editor: string } = {
  weekStartDay: 'monday',
  reportFormat: 'terminal',
  listFormat: 'table',
  timeFormat: '24h',
  editor: '', // Will use getEditor() fallback
  // churn is undefined by default (not enabled)
};

export const VALID_CONFIG_KEYS = [
  'weekStartDay',
  'reportFormat',
  'listFormat',
  'timeFormat',
  'editor',
  'churn.enabled',
  'churn.db_path',
] as const;

export type ConfigKey = typeof VALID_CONFIG_KEYS[number];
