import { scheduleListCommand } from './schedule-list';
import { scheduleAddCommand } from './schedule-add';
import { scheduleEditCommand } from './schedule-edit';
import { scheduleRemoveCommand } from './schedule-remove';
import { scheduleImportCommand } from './schedule-import';
import chalk from 'chalk';

/**
 * Main schedule command - routes to subcommands
 */
export async function scheduleCommand(
  subcommand: string | undefined,
  args: string[],
  options: any
): Promise<void> {
  // No subcommand = list
  if (!subcommand) {
    scheduleListCommand();
    return;
  }

  switch (subcommand) {
    case 'add':
      scheduleAddCommand(args, options);
      break;
    case 'edit':
      scheduleEditCommand(args[0], args.slice(1), options);
      break;
    case 'remove':
    case 'rm':
      await scheduleRemoveCommand(args[0], options);
      break;
    case 'list':
    case 'ls':
      scheduleListCommand();
      break;
    case 'import':
      scheduleImportCommand(args[0], options);
      break;
    default:
      console.error(chalk.red(`Error: Unknown subcommand: ${subcommand}`));
      console.log(chalk.yellow('Available subcommands: add, edit, remove, list, import'));
      process.exit(1);
  }
}
