#!/usr/bin/env node

import { Command } from 'commander';
import { logCommand } from './cli/commands/log';
import { startCommand } from './cli/commands/start';
import { stopCommand } from './cli/commands/stop';
import { reportCommand } from './cli/commands/report';

const program = new Command();

program
  .name('tt')
  .description('Unix-philosophy CLI time tracker')
  .version('1.0.0');

// Log command
program
  .command('log')
  .description('Parse and insert time entries from file or stdin')
  .argument('[file]', 'Log file to parse (reads from stdin if not provided)')
  .action(logCommand);

// Report command
program
  .command('report')
  .description('Generate weekly time report')
  .option('--week <week>', 'Week to report: "current" (default), "last", or ISO week (2024-W51)', 'current')
  .option('--project <project>', 'Filter by project')
  .option('--tag <tags>', 'Filter by tags (comma-separated)')
  .option('--format <format>', 'Output format: "terminal" (default), "json", "csv"', 'terminal')
  .action(reportCommand);

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

program.parse();
