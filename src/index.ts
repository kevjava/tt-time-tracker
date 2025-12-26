#!/usr/bin/env node

import { Command } from 'commander';
import { logCommand } from './cli/commands/log';
import { startCommand } from './cli/commands/start';
import { stopCommand } from './cli/commands/stop';
import { reportCommand } from './cli/commands/report';
import { statusCommand } from './cli/commands/status';
import { interruptCommand } from './cli/commands/interrupt';
import { resumeCommand } from './cli/commands/resume';
import { listCommand } from './cli/commands/list';
import { deleteCommand } from './cli/commands/delete';
import { editCommand } from './cli/commands/edit';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('tt')
  .description('Unix-philosophy CLI time tracker')
  .option('-v, --verbose', 'Output debug messages.')
  .version('1.0.0');

// Status command (default)
program
  .command('status', { isDefault: true })
  .description('Show status of all running timers and interruptions')
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
  .action(reportCommand);

// List command
program
  .command('list')
  .description('List sessions in columnar format for specified time range')
  .option('--week <week>', 'Week to list: "current" (default), "last", or ISO week (2024-W51)', 'current')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('--project <project>', 'Filter by project')
  .option('--tag <tags>', 'Filter by tags (comma-separated)')
  .option('--state <state>', 'Filter by state: working, paused, completed, abandoned')
  .action(listCommand);

// Start command
program
  .command('start')
  .description('Start tracking a task')
  .argument('<description>', 'Task description')
  .option('-p, --project <project>', 'Project name')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-e, --estimate <duration>', 'Estimated duration (e.g., 2h, 30m)')
  .action(startCommand);

// Stop command
program
  .command('stop')
  .description('Stop current active task')
  .option('-r, --remark <remark>', 'Add remark to task')
  .action(stopCommand);

// Interrupt command
program
  .command('interrupt')
  .description('Interrupt current task with a new task')
  .argument('<description>', 'Interruption description')
  .option('-p, --project <project>', 'Project name')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-e, --estimate <duration>', 'Estimated duration (e.g., 2h, 30m)')
  .action(interruptCommand);

// Resume command
program
  .command('resume')
  .description('Complete current interruption and resume parent task')
  .option('-r, --remark <remark>', 'Add remark to interruption')
  .action(resumeCommand);

// Delete command
program
  .command('delete')
  .description('Delete a session by ID')
  .argument('<session-id>', 'Session ID to delete')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(deleteCommand);

// Edit command
program
  .command('edit')
  .description('Edit a session by ID')
  .argument('<session-id>', 'Session ID to edit')
  .option('-d, --description <description>', 'Update description')
  .option('-p, --project <project>', 'Update project')
  .option('-t, --tags <tags>', 'Update tags (comma-separated)')
  .option('-e, --estimate <duration>', 'Update estimate (e.g., 2h, 30m)')
  .option('-r, --remark <remark>', 'Update remark')
  .option('--start-time <time>', 'Update start time (ISO 8601 format)')
  .option('--end-time <time>', 'Update end time (ISO 8601 format, empty string to clear)')
  .option('--state <state>', 'Update state (working, paused, completed, abandoned)')
  .action(editCommand);

program.parse();
