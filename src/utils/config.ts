import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { UserConfig, DEFAULT_CONFIG, VALID_CONFIG_KEYS, ConfigKey } from '../types/config';

/**
 * Get the data directory for TT time tracker
 * Respects TT_DATA_DIR environment variable
 */
export function getDataDir(): string {
  const customDir = process.env.TT_DATA_DIR;

  if (customDir) {
    return customDir;
  }

  // Default to ~/.local/share/tt
  const home = homedir();
  return join(home, '.local', 'share', 'tt');
}

/**
 * Get the config directory
 */
export function getConfigDir(): string {
  const home = homedir();
  return join(home, '.config', 'tt');
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  return join(getDataDir(), 'tt.db');
}

/**
 * Ensure data directory exists
 */
export function ensureDataDir(): void {
  const dataDir = getDataDir();

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  const configDir = getConfigDir();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Load user configuration
 * Returns default config if file doesn't exist or is invalid
 */
export function loadConfig(): Required<UserConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const contents = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(contents) as Partial<UserConfig>;

    // Merge with defaults
    const config: Required<UserConfig> = {
      weekStartDay: parsed.weekStartDay || DEFAULT_CONFIG.weekStartDay,
      reportFormat: parsed.reportFormat || DEFAULT_CONFIG.reportFormat,
      listFormat: parsed.listFormat || DEFAULT_CONFIG.listFormat,
      timeFormat: parsed.timeFormat || DEFAULT_CONFIG.timeFormat,
      editor: parsed.editor || DEFAULT_CONFIG.editor,
    };

    return config;
  } catch (error) {
    // If config is malformed, return defaults
    console.warn(`Warning: Could not parse config file, using defaults: ${error}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save user configuration
 */
export function saveConfig(config: UserConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();

  // Only save non-default values
  const toSave: Partial<UserConfig> = {};

  if (config.weekStartDay && config.weekStartDay !== DEFAULT_CONFIG.weekStartDay) {
    toSave.weekStartDay = config.weekStartDay;
  }
  if (config.reportFormat && config.reportFormat !== DEFAULT_CONFIG.reportFormat) {
    toSave.reportFormat = config.reportFormat;
  }
  if (config.listFormat && config.listFormat !== DEFAULT_CONFIG.listFormat) {
    toSave.listFormat = config.listFormat;
  }
  if (config.timeFormat && config.timeFormat !== DEFAULT_CONFIG.timeFormat) {
    toSave.timeFormat = config.timeFormat;
  }
  if (config.editor && config.editor !== DEFAULT_CONFIG.editor) {
    toSave.editor = config.editor;
  }

  writeFileSync(configPath, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
}

/**
 * Validate a config key
 */
export function isValidConfigKey(key: string): key is ConfigKey {
  return VALID_CONFIG_KEYS.includes(key as ConfigKey);
}

/**
 * Validate a config value for a given key
 */
export function isValidConfigValue(key: ConfigKey, value: string): boolean {
  switch (key) {
    case 'weekStartDay':
      return value === 'monday' || value === 'sunday';
    case 'reportFormat':
      return value === 'terminal' || value === 'json' || value === 'csv';
    case 'listFormat':
      return value === 'table' || value === 'log';
    case 'timeFormat':
      return value === '24h' || value === '12h';
    case 'editor':
      return typeof value === 'string' && value.length > 0;
    default:
      return false;
  }
}

/**
 * Get the editor command from config, environment, or default
 */
export function getEditor(): string {
  const config = loadConfig();

  if (config.editor) {
    return config.editor;
  }

  return process.env.EDITOR || process.env.VISUAL || 'vi';
}
