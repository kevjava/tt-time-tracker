#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { logCommand } from './cli/commands/log';
import { startCommand } from './cli/commands/start';
import { nextCommand } from './cli/commands/next';
import { switchCommand } from './cli/commands/switch';
import { stopCommand } from './cli/commands/stop';
import { reportCommand } from './cli/commands/report';
import { statusCommand } from './cli/commands/status';
import { interruptCommand } from './cli/commands/interrupt';
import { resumeCommand } from './cli/commands/resume';
import { pauseCommand } from './cli/commands/pause';
import { abandonCommand } from './cli/commands/abandon';
import { listCommand } from './cli/commands/list';
import { findCommand } from './cli/commands/find';
import { deleteCommand } from './cli/commands/delete';
import { editCommand } from './cli/commands/edit';
import { configCommand } from './cli/commands/config';
import { incompleteCommand } from './cli/commands/incomplete';
import { scheduleCommand } from './cli/commands/schedule';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('tt')
  .description('Unix-philosophy CLI time tracker')
  .option('-v, --verbose', 'Output debug messages.')
  .version('1.0.0')
  .configureOutput({
    outputError: (str, write) => {
      // Intercept error messages to provide better context for unknown commands
      if (str.includes("too many arguments for 'status'")) {
        const args = process.argv.slice(2);
        const possibleCommand = args.find(arg => !arg.startsWith('-'));
        if (possibleCommand && possibleCommand !== 'status') {
          write(chalk.red(`error: unknown command '${possibleCommand}'\n`));
          const availableCommands = program.commands.map(cmd => cmd.name()).filter(n => n);
          write(chalk.yellow(`Available commands: ${availableCommands.join(', ')}\n`));
          write(chalk.gray(`Run 'tt --help' for more information.\n`));
          return;
        }
      }
      write(str);
    }
  });

// Status command (default)
program
  .command('status', { isDefault: true })
  .description('Show status of all running timers and interruptions')
  .allowExcessArguments(false)
  .action(() => statusCommand({ isDefault: process.argv.length === 2 }));

// Hook to enable verbose logging before any command runs
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals();
  if (opts.verbose) {
    logger.setVerbose(true);
    logger.debug('Verbose mode enabled');
  }
});

// Log command
program
  .command('log')
  .description('Parse and insert time entries from file or stdin')
  .argument('[file]', 'Log file to parse (reads from stdin if not provided)')
  .option('--overwrite', 'Allow overwriting overlapping sessions after confirmation')
  .option('--dry-run', 'Parse and validate without importing to database')
  .action(logCommand);

// Report command
program
  .command('report')
  .description('Generate time report for a date range')
  .option('--week <week>', 'Week to report: "current" (default), "last", or ISO week (2024-W51)', 'current')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--project <project>', 'Filter by project')
  .option('--tag <tags>', 'Filter by tags (comma-separated)')
  .option('--format <format>', 'Output format: "terminal" (default), "json", "csv"', 'terminal')
  .option('--compare', 'Compare with previous period')
  .action(reportCommand);

// List command
program
  .command('list [session-id]')
  .alias('ls')
  .description('List sessions in columnar format, or show detailed view of a single session')
  .option('--week <week>', 'Week to list: "current" (default), "last", or ISO week (2024-W51)', 'current')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--project <project>', 'Filter by project')
  .option('--tag <tags>', 'Filter by tags (comma-separated)')
  .option('--state <state>', 'Filter by state: working, paused, completed, abandoned')
  .option('--format <format>', 'Output format: "table" (default), "log"', 'table')
  .action(listCommand);

// Find command
program
  .command('find')
  .alias('search')
  .description('Search sessions by description, project, and tags')
  .argument('<query>', 'Search query (supports @project +tag syntax)')
  .option('--from <date>', 'Start date (fuzzy date or YYYY-MM-DD)')
  .option('--to <date>', 'End date (fuzzy date or YYYY-MM-DD)')
  .option('--state <state>', 'Filter by state (working, paused, completed, abandoned)')
  .action(findCommand);

// Start command
program
  .command('start')
  .description('Start tracking a task')
  .argument('[descriptionOrId...]', 'Task description, session ID to duplicate, or log notation (e.g., "37" or "09:30 Task name @project +tag ~1h")')
  .option('-p, --project <project>', 'Project name (overrides log notation or template)')
  .option('-t, --tags <tags>', 'Comma-separated tags (overrides log notation or template)')
  .option('-e, --estimate <duration>', 'Estimated duration (overrides log notation or template, e.g., 2h, 30m)')
  .option('--at <time>', 'Start time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(startCommand);

// Next command
program
  .command('next')
  .description('Stop current task (if any) and start tracking a new task')
  .argument('[descriptionOrId...]', 'Task description, session ID to duplicate, or log notation (e.g., "37" or "09:30 Task name @project +tag ~1h")')
  .option('-p, --project <project>', 'Project name (overrides log notation or template)')
  .option('-t, --tags <tags>', 'Comma-separated tags (overrides log notation or template)')
  .option('-e, --estimate <duration>', 'Estimated duration (overrides log notation or template, e.g., 2h, 30m)')
  .option('--at <time>', 'Start time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(nextCommand);

// Switch command
program
  .command('switch')
  .description('Pause current task (if any) and start tracking a new task')
  .argument('[descriptionOrId...]', 'Task description, session ID to duplicate, or log notation (e.g., "37" or "09:30 Task name @project +tag ~1h")')
  .option('-p, --project <project>', 'Project name (overrides log notation or template)')
  .option('-t, --tags <tags>', 'Comma-separated tags (overrides log notation or template)')
  .option('-e, --estimate <duration>', 'Estimated duration (overrides log notation or template, e.g., 2h, 30m)')
  .option('--at <time>', 'Start time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(switchCommand);

// Stop command
program
  .command('stop')
  .description('Stop current active task')
  .option('-r, --remark <remark>', 'Add remark to task')
  .option('--at <time>', 'Stop time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(stopCommand);

// Interrupt command
program
  .command('interrupt')
  .description('Interrupt current task with a new task')
  .argument('[descriptionOrId...]', 'Interruption description, session ID to duplicate, or log notation (e.g., "37" or "10:30 Quick fix @project +urgent")')
  .option('-p, --project <project>', 'Project name (overrides log notation or template)')
  .option('-t, --tags <tags>', 'Comma-separated tags (overrides log notation or template)')
  .option('-e, --estimate <duration>', 'Estimated duration (overrides log notation or template, e.g., 2h, 30m)')
  .option('--at <time>', 'Interrupt time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(interruptCommand);

// Resume command
program
  .command('resume')
  .description('Complete current interruption and resume parent task, or resume a paused task by ID')
  .argument('[id]', 'Session ID to resume (optional, for paused tasks)')
  .option('-r, --remark <remark>', 'Add remark to interruption or resumed session')
  .option('--at <time>', 'Resume time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .option('-y, --yes', 'Skip confirmation when resuming completed sessions')
  .action(resumeCommand);

// Pause command
program
  .command('pause')
  .description('Pause the current active task without starting an interruption')
  .option('--reason <reason>', 'Reason for pausing')
  .option('--at <time>', 'Pause time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(pauseCommand);

// Abandon command
program
  .command('abandon')
  .description('Abandon the current active task')
  .option('--reason <reason>', 'Reason for abandoning')
  .option('--at <time>', 'Abandon time (e.g., "15:51", "2025-12-29 15:51", "-30m")')
  .action(abandonCommand);

// Incomplete command
program
  .command('incomplete')
  .description('Review and triage paused (incomplete) sessions')
  .option('--from <date>', 'Start date for paused sessions (fuzzy date or YYYY-MM-DD)')
  .option('--to <date>', 'End date for paused sessions (fuzzy date or YYYY-MM-DD)')
  .option('--all', 'Show all paused sessions (default: last 30 days)')
  .action(incompleteCommand);

// Delete command
program
  .command('delete')
  .aliases(['rm', 'remove'])
  .description('Delete one or more sessions')
  .argument('[session-ids...]', 'Session IDs to delete (can specify multiple)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--from <date>', 'Delete sessions from this date (fuzzy date or YYYY-MM-DD)')
  .option('--to <date>', 'Delete sessions up to this date (fuzzy date or YYYY-MM-DD)')
  .option('-p, --project <project>', 'Delete sessions for specific project')
  .option('-t, --tag <tags>', 'Delete sessions with specific tag(s) (comma-separated)')
  .option('-s, --state <state>', 'Delete sessions with specific state (working, paused, completed, abandoned)')
  .option('--dry-run', 'Show what would be deleted without actually deleting')
  .action(deleteCommand);

// Edit command
program
  .command('edit')
  .description('Edit a session by ID using flags or log notation')
  .argument('<session-id>', 'Session ID to edit')
  .argument('[log-notation...]', 'Log notation for updates (e.g., ~20m, @project, +tag1 +tag2)')
  .option('-d, --description <description>', 'Update description')
  .option('-p, --project <project>', 'Update project')
  .option('-t, --tags <tags>', 'Update tags (comma-separated)')
  .option('-e, --estimate <duration>', 'Update estimate (e.g., 2h, 30m)')
  .option('-r, --remark <remark>', 'Update remark')
  .option('--start-time <time>', 'Update start time (ISO 8601 format)')
  .option('--end-time <time>', 'Update end time (ISO 8601 format, empty string to clear)')
  .option('--state <state>', 'Update state (working, paused, completed, abandoned)')
  .option('--continues <session-id>', 'Set continuation session ID (empty string to clear)')
  .action(editCommand);

// Config command
program
  .command('config')
  .description('Manage user configuration')
  .argument('[subcommand]', 'Subcommand: get, set, edit, path')
  .argument('[args...]', 'Arguments for subcommand')
  .action(configCommand);

// Schedule command
program
  .command('schedule [subcommand] [args...]')
  .description('Manage scheduled tasks')
  .option('-p, --project <project>', 'Project name')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-e, --estimate <duration>', 'Estimated duration')
  .option('--priority <priority>', 'Priority 1-9')
  .option('--start-time <datetime>', 'Scheduled start date/time')
  .option('--scheduled <datetime>', 'Scheduled date/time (deprecated, use --start-time)')
  .option('-y, --yes', 'Skip confirmation prompt when removing tasks')
  .action(async (subcommand, args, options) => {
    await scheduleCommand(subcommand, args || [], options);
  });

program.parse();
