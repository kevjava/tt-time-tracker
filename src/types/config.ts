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
}

export const DEFAULT_CONFIG: Required<UserConfig> = {
  weekStartDay: 'monday',
  reportFormat: 'terminal',
  listFormat: 'table',
  timeFormat: '24h',
  editor: '', // Will use getEditor() fallback
};

export const VALID_CONFIG_KEYS = [
  'weekStartDay',
  'reportFormat',
  'listFormat',
  'timeFormat',
  'editor',
] as const;

export type ConfigKey = typeof VALID_CONFIG_KEYS[number];
