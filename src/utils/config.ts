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
 * Loaded config with required base fields and optional churn
 */
export type LoadedConfig = {
  weekStartDay: 'monday' | 'sunday';
  reportFormat: 'terminal' | 'json' | 'csv';
  listFormat: 'table' | 'log';
  timeFormat: '24h' | '12h';
  editor: string;
  churn?: UserConfig['churn'];
};

/**
 * Load user configuration
 * Returns default config if file doesn't exist or is invalid
 */
export function loadConfig(): LoadedConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const contents = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(contents) as Partial<UserConfig>;

    // Merge with defaults
    const config: LoadedConfig = {
      weekStartDay: parsed.weekStartDay || DEFAULT_CONFIG.weekStartDay,
      reportFormat: parsed.reportFormat || DEFAULT_CONFIG.reportFormat,
      listFormat: parsed.listFormat || DEFAULT_CONFIG.listFormat,
      timeFormat: parsed.timeFormat || DEFAULT_CONFIG.timeFormat,
      editor: parsed.editor || DEFAULT_CONFIG.editor,
      churn: parsed.churn,
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
  if (config.churn && (config.churn.enabled !== undefined || config.churn.db_path !== undefined)) {
    toSave.churn = config.churn;
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
    case 'churn.enabled':
      return value === 'true' || value === 'false';
    case 'churn.db_path':
      return typeof value === 'string' && value.length > 0;
    default:
      return false;
  }
}

/**
 * Get a nested config value by dot-notation key
 */
export function getNestedConfigValue(config: UserConfig, key: string): string | boolean | undefined {
  if (key.startsWith('churn.')) {
    const subKey = key.substring(6) as keyof NonNullable<UserConfig['churn']>;
    return config.churn?.[subKey];
  }
  return config[key as keyof UserConfig] as string | undefined;
}

/**
 * Set a nested config value by dot-notation key
 */
export function setNestedConfigValue(config: UserConfig, key: string, value: string): UserConfig {
  if (key.startsWith('churn.')) {
    const subKey = key.substring(6) as keyof NonNullable<UserConfig['churn']>;
    const churn = config.churn ?? {};
    if (subKey === 'enabled') {
      churn.enabled = value === 'true';
    } else if (subKey === 'db_path') {
      churn.db_path = value;
    }
    return { ...config, churn };
  }
  return { ...config, [key]: value };
}

/**
 * Expand path with home directory (~) replacement
 */
export function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace('~', homedir());
  }
  return path;
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
