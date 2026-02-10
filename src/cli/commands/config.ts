import chalk from 'chalk';
import { spawnSync } from 'child_process';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getEditor,
  isValidConfigKey,
  isValidConfigValue,
  getNestedConfigValue,
  setNestedConfigValue,
} from '../../utils/config';
import { DEFAULT_CONFIG, ConfigKey } from '../../types/config';

/**
 * tt config command implementation
 * Manages user configuration
 */
export function configCommand(subcommand?: string, args?: string[]): void {
  try {
    // No subcommand: show current config
    if (!subcommand) {
      showConfig();
      return;
    }

    switch (subcommand) {
      case 'get':
        if (!args || args.length === 0) {
          console.error(chalk.red('Error: Missing config key'));
          console.error('Usage: tt config get <key>');
          process.exit(1);
        }
        getConfigValue(args[0]);
        break;

      case 'set':
        if (!args || args.length < 2) {
          console.error(chalk.red('Error: Missing config key or value'));
          console.error('Usage: tt config set <key> <value>');
          process.exit(1);
        }
        setConfigValue(args[0], args[1]);
        break;

      case 'edit':
        editConfig();
        break;

      case 'path':
        console.log(getConfigPath());
        break;

      default:
        console.error(chalk.red(`Error: Unknown subcommand '${subcommand}'`));
        console.error('Available subcommands: get, set, edit, path');
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

/**
 * Show current configuration
 */
function showConfig(): void {
  const config = loadConfig();
  const configPath = getConfigPath();

  console.log(chalk.bold('\nCurrent Configuration:\n'));
  console.log(`${chalk.gray('Config file:')} ${configPath}\n`);

  // Display each config value
  console.log(`${chalk.cyan('weekStartDay:')}    ${config.weekStartDay}${config.weekStartDay === DEFAULT_CONFIG.weekStartDay ? chalk.gray(' (default)') : ''}`);
  console.log(`${chalk.cyan('reportFormat:')}    ${config.reportFormat}${config.reportFormat === DEFAULT_CONFIG.reportFormat ? chalk.gray(' (default)') : ''}`);
  console.log(`${chalk.cyan('listFormat:')}      ${config.listFormat}${config.listFormat === DEFAULT_CONFIG.listFormat ? chalk.gray(' (default)') : ''}`);
  console.log(`${chalk.cyan('timeFormat:')}      ${config.timeFormat}${config.timeFormat === DEFAULT_CONFIG.timeFormat ? chalk.gray(' (default)') : ''}`);
  console.log(`${chalk.cyan('dateFormat:')}      ${config.dateFormat}${config.dateFormat === DEFAULT_CONFIG.dateFormat ? chalk.gray(' (default)') : ''}`);
  console.log(`${chalk.cyan('dateFormatShort:')}  ${config.dateFormatShort}${config.dateFormatShort === DEFAULT_CONFIG.dateFormatShort ? chalk.gray(' (default)') : ''}`);
  console.log(`${chalk.cyan('locale:')}          ${config.locale || chalk.gray('(auto-detect from system)')}`);
  console.log(`${chalk.cyan('editor:')}          ${config.editor || chalk.gray('(uses $EDITOR, $VISUAL, or vi)')}`);

  // Churn integration settings
  console.log(`${chalk.cyan('churn.enabled:')}   ${config.churn?.enabled ?? chalk.gray('false (default)')}`);
  console.log(`${chalk.cyan('churn.db_path:')}   ${config.churn?.db_path || chalk.gray('~/.config/churn/churn.db (default)')}`);

  console.log(chalk.gray('\nCommands:'));
  console.log(chalk.gray('  tt config get <key>        Get a config value'));
  console.log(chalk.gray('  tt config set <key> <value> Set a config value'));
  console.log(chalk.gray('  tt config edit             Open config in editor'));
  console.log(chalk.gray('  tt config path             Show config file path'));
}

/**
 * Get a single config value
 */
function getConfigValue(key: string): void {
  if (!isValidConfigKey(key)) {
    console.error(chalk.red(`Error: Invalid config key '${key}'`));
    console.error(
      chalk.gray(`Valid keys: weekStartDay, reportFormat, listFormat, timeFormat, dateFormat, dateFormatShort, locale, editor, churn.enabled, churn.db_path`)
    );
    process.exit(1);
  }

  const config = loadConfig();
  const value = getNestedConfigValue(config, key);

  console.log(value ?? '');
}

/**
 * Set a config value
 */
function setConfigValue(key: string, value: string): void {
  if (!isValidConfigKey(key)) {
    console.error(chalk.red(`Error: Invalid config key '${key}'`));
    console.error(
      chalk.gray(`Valid keys: weekStartDay, reportFormat, listFormat, timeFormat, dateFormat, dateFormatShort, locale, editor, churn.enabled, churn.db_path`)
    );
    process.exit(1);
  }

  if (!isValidConfigValue(key, value)) {
    console.error(chalk.red(`Error: Invalid value '${value}' for ${key}`));
    console.error(chalk.gray(getValidValuesHint(key)));
    process.exit(1);
  }

  const config = loadConfig();
  const updates = setNestedConfigValue(config, key, value);

  saveConfig(updates);

  console.log(chalk.green(`✓ Set ${chalk.cyan(key)} = ${chalk.bold(value)}`));
}

/**
 * Open config file in editor
 */
function editConfig(): void {
  const configPath = getConfigPath();
  const editor = getEditor();

  console.log(chalk.gray(`Opening ${configPath} in ${editor}...`));

  const result = spawnSync(editor, [configPath], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    console.error(chalk.red(`Error: Failed to open editor: ${result.error.message}`));
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(chalk.red(`Editor exited with code ${result.status}`));
    process.exit(1);
  }

  // Validate the config after editing
  try {
    loadConfig();
    console.log(chalk.green('✓ Config file updated'));
  } catch (error) {
    console.error(chalk.red(`Warning: Config file may be invalid: ${error}`));
    console.error(chalk.yellow('Run `tt config` to see current configuration'));
  }
}

/**
 * Get hint for valid values for a config key
 */
function getValidValuesHint(key: ConfigKey): string {
  switch (key) {
    case 'weekStartDay':
      return 'Valid values: monday, sunday';
    case 'reportFormat':
      return 'Valid values: terminal, json, csv';
    case 'listFormat':
      return 'Valid values: table, log';
    case 'timeFormat':
      return 'Valid values: 24h, 12h';
    case 'dateFormat':
      return 'Valid value: date-fns format string with year (e.g., "MMM d, yyyy", "yyyy-MM-dd", "d. MMMM yyyy")';
    case 'dateFormatShort':
      return 'Valid value: date-fns format string without year (e.g., "MMM d", "dd MMM", "d. MMM")';
    case 'locale':
      return 'Valid value: date-fns locale name (e.g., "de", "fr", "en-GB") or empty for auto-detect';
    case 'editor':
      return 'Valid value: any editor command (e.g., vim, nano, "code --wait")';
    case 'churn.enabled':
      return 'Valid values: true, false';
    case 'churn.db_path':
      return 'Valid value: path to churn database (e.g., ~/.config/churn/churn.db)';
    default:
      return '';
  }
}
