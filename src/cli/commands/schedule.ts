import { scheduleListCommand } from './schedule-list';
import { scheduleAddCommand } from './schedule-add';
import { scheduleEditCommand } from './schedule-edit';
import { scheduleRemoveCommand } from './schedule-remove';
import chalk from 'chalk';

/**
 * Main schedule command - routes to subcommands
 */
export function scheduleCommand(
  subcommand: string | undefined,
  args: string[],
  options: any
): void {
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
      scheduleRemoveCommand(args[0]);
      break;
    case 'list':
    case 'ls':
      scheduleListCommand();
      break;
    default:
      console.error(chalk.red(`Error: Unknown subcommand: ${subcommand}`));
      console.log(chalk.yellow('Available subcommands: add, edit, remove, list'));
      process.exit(1);
  }
}
