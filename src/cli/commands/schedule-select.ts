import chalk from 'chalk';
import * as readline from 'readline';
import { format } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ScheduledTask, Session } from '../../types/session';
import * as theme from '../../utils/theme';
import { TaskScheduler, ScheduledTask as SchedulerTask } from '@kevjava/task-parser';
import { loadConfig } from '../../utils/config';
import { getScheduler, isChurnEnabled } from '../../utils/scheduler';

interface SelectionItem {
  globalNumber: number;
  task: (ScheduledTask & { tags: string[] }) | (Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number });
  category: 'oldest' | 'important' | 'urgent' | 'incomplete';
}

interface ChurnSelectionItem {
  globalNumber: number;
  task: SchedulerTask;
}

export interface SelectedTask {
  type: 'tt-scheduled' | 'tt-session' | 'churn';
  ttTask?: ScheduledTask & { tags: string[] };
  ttSession?: Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number };
  churnTask?: SchedulerTask;
}

/**
 * Present interactive selection UI and return selected task (unified interface)
 * Returns null if no tasks available or user cancels
 */
export async function promptTaskSelection(db: TimeTrackerDB): Promise<SelectedTask | null> {
  const config = loadConfig();

  if (isChurnEnabled(config)) {
    const scheduler = await getScheduler(config, db);
    return promptChurnTaskSelection(scheduler, db);
  }

  return promptTTTaskSelection(db);
}

/**
 * Present task selection when churn is enabled
 * Shows churn tasks prioritized by curves, plus any incomplete TT sessions
 */
async function promptChurnTaskSelection(
  scheduler: TaskScheduler,
  db: TimeTrackerDB
): Promise<SelectedTask | null> {
  // Get incomplete sessions from TT (still need to handle work in progress)
  const categories = db.getScheduledTasksForSelection();
  const incompleteSessions = categories.incomplete;

  // Get churn tasks
  const plan = await scheduler.getDailyPlan(new Date(), { limit: 20 });
  const churnTasks = plan.tasks;

  if (churnTasks.length === 0 && incompleteSessions.length === 0) {
    return null;
  }

  const ttItems: SelectionItem[] = [];
  const churnItems: ChurnSelectionItem[] = [];
  let globalNumber = 1;

  // Show incomplete TT sessions first (work in progress takes priority)
  if (incompleteSessions.length > 0) {
    console.log(chalk.bold('\nIncomplete Tasks:'));
    for (const session of incompleteSessions) {
      ttItems.push({ globalNumber, task: session, category: 'incomplete' });
      displayTask(globalNumber, session);
      globalNumber++;
    }
  }

  // Show churn tasks
  if (churnTasks.length > 0) {
    console.log(chalk.bold('\nScheduled Tasks (Churn):'));
    for (const task of churnTasks) {
      churnItems.push({ globalNumber, task });
      displayChurnTask(globalNumber, task);
      globalNumber++;
    }
  }

  // Prompt for selection
  const defaultNumber = 1;
  console.log(chalk.gray(`\nEnter task number (default: ${defaultNumber}) or 'q' to cancel:`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();

      const trimmed = answer.trim();

      if (trimmed.toLowerCase() === 'q' || trimmed.toLowerCase() === 'quit') {
        resolve(null);
        return;
      }

      const selectedNumber = trimmed === '' ? defaultNumber : parseInt(trimmed, 10);
      if (isNaN(selectedNumber)) {
        console.error(chalk.red('Error: Invalid selection'));
        process.exit(1);
      }

      // Check TT items first
      const ttItem = ttItems.find(i => i.globalNumber === selectedNumber);
      if (ttItem) {
        if ('startTime' in ttItem.task) {
          resolve({ type: 'tt-session', ttSession: ttItem.task as Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number } });
        } else {
          resolve({ type: 'tt-scheduled', ttTask: ttItem.task as ScheduledTask & { tags: string[] } });
        }
        return;
      }

      // Check churn items
      const churnItem = churnItems.find(i => i.globalNumber === selectedNumber);
      if (churnItem) {
        resolve({ type: 'churn', churnTask: churnItem.task });
        return;
      }

      console.error(chalk.red(`Error: No task with number ${selectedNumber}`));
      process.exit(1);
    });
  });
}

/**
 * Present task selection when using TT scheduler (original behavior)
 */
async function promptTTTaskSelection(
  db: TimeTrackerDB
): Promise<SelectedTask | null> {
  const result = await promptScheduledTaskSelectionLegacy(db);
  if (!result) return null;

  if ('startTime' in result) {
    return { type: 'tt-session', ttSession: result as Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number } };
  }
  return { type: 'tt-scheduled', ttTask: result as ScheduledTask & { tags: string[] } };
}

/**
 * Present interactive selection UI and return selected task
 * Returns null if no tasks available or user cancels
 * @deprecated Use promptTaskSelection instead
 */
export async function promptScheduledTaskSelection(
  db: TimeTrackerDB
): Promise<(ScheduledTask & { tags: string[] }) | (Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number }) | null> {
  return promptScheduledTaskSelectionLegacy(db);
}

/**
 * Legacy implementation for TT scheduler
 */
async function promptScheduledTaskSelectionLegacy(
  db: TimeTrackerDB
): Promise<(ScheduledTask & { tags: string[] }) | (Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number }) | null> {
  const categories = db.getScheduledTasksForSelection();

  // Check if any tasks exist
  if (categories.oldest.length === 0 && categories.incomplete.length === 0) {
    return null;
  }

  // Build selection list with globally unique numbers
  const items: SelectionItem[] = [];
  let globalNumber = 1;

  // Track which tasks have been shown (by ID) to display with consistent numbers
  const taskNumberMap = new Map<number, number>();

  // Incomplete stanza (show first, most important)
  if (categories.incomplete.length > 0) {
    console.log(chalk.bold('\nIncomplete Tasks:'));
    for (const task of categories.incomplete) {
      items.push({ globalNumber, task, category: 'incomplete' });
      taskNumberMap.set(task.id!, globalNumber);
      displayTask(globalNumber, task);
      globalNumber++;
    }
  }

  // Oldest stanza
  if (categories.oldest.length > 0) {
    console.log(chalk.bold('\nOldest Tasks:'));
    for (const task of categories.oldest) {
      items.push({ globalNumber, task, category: 'oldest' });
      taskNumberMap.set(task.id!, globalNumber);
      displayTask(globalNumber, task);
      globalNumber++;
    }
  }

  // Important stanza (only show if has tasks with priority != 5)
  if (categories.important.length > 0) {
    console.log(chalk.bold('\nImportant Tasks:'));
    for (const task of categories.important) {
      // Check if already shown
      if (taskNumberMap.has(task.id!)) {
        // Already shown - display with original number
        const existingNumber = taskNumberMap.get(task.id!)!;
        displayTask(existingNumber, task);
      } else {
        // New task - assign new global number
        items.push({ globalNumber, task, category: 'important' });
        taskNumberMap.set(task.id!, globalNumber);
        displayTask(globalNumber, task);
        globalNumber++;
      }
    }
  }

  // Urgent stanza (only show if has scheduled tasks)
  if (categories.urgent.length > 0) {
    console.log(chalk.bold('\nUrgent Tasks (Scheduled):'));
    for (const task of categories.urgent) {
      if (taskNumberMap.has(task.id!)) {
        // Already shown - display with original number
        const existingNumber = taskNumberMap.get(task.id!)!;
        displayTask(existingNumber, task);
      } else {
        // New task - assign new global number
        items.push({ globalNumber, task, category: 'urgent' });
        taskNumberMap.set(task.id!, globalNumber);
        displayTask(globalNumber, task);
        globalNumber++;
      }
    }
  }

  // Prompt for selection
  const defaultNumber = 1;
  console.log(chalk.gray(`\nEnter task number (default: ${defaultNumber}) or 'q' to cancel:`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();

      const trimmed = answer.trim();

      // Cancel
      if (trimmed.toLowerCase() === 'q' || trimmed.toLowerCase() === 'quit') {
        resolve(null);
        return;
      }

      // Default selection
      if (trimmed === '') {
        resolve(items[0].task);
        return;
      }

      // Parse number
      const selectedNumber = parseInt(trimmed, 10);
      if (isNaN(selectedNumber)) {
        console.error(chalk.red('Error: Invalid selection'));
        process.exit(1);
      }

      const selectedItem = items.find(i => i.globalNumber === selectedNumber);
      if (!selectedItem) {
        console.error(chalk.red(`Error: No task with number ${selectedNumber}`));
        process.exit(1);
      }

      resolve(selectedItem.task);
    });
  });
}

function displayTask(
  number: number,
  task: (ScheduledTask & { tags: string[] }) | (Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number })
): void {
  let line = `  ${chalk.cyan(number.toString().padStart(2))}. ${task.description}`;

  if (task.project) {
    line += ` ${theme.formatProject(task.project)}`;
  }

  if (task.tags.length > 0) {
    line += ` ${theme.formatTags(task.tags)}`;
  }

  // Check if this is a Session (has startTime) or ScheduledTask
  if ('startTime' in task) {
    // This is an incomplete Session (always paused, never active/working)
    const session = task as Session & { tags: string[]; totalMinutes?: number; chainSessionCount?: number };

    // Show paused indicator
    line += ` ${chalk.yellow('[PAUSED]')}`;

    // Show total time spent
    if (session.totalMinutes !== undefined && session.totalMinutes > 0) {
      const hours = Math.floor(session.totalMinutes / 60);
      const mins = Math.round(session.totalMinutes % 60);
      const timeStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
      line += ` ${chalk.gray(`[${timeStr} spent]`)}`;
    }

    // Show chain count if > 1
    if (session.chainSessionCount !== undefined && session.chainSessionCount > 1) {
      line += ` ${chalk.gray(`[${session.chainSessionCount} sessions]`)}`;
    }

    // Show estimate if available
    if (session.estimateMinutes) {
      line += ` ${theme.formatEstimate(session.estimateMinutes)}`;
    }
  } else {
    // This is a ScheduledTask
    const scheduledTask = task as ScheduledTask & { tags: string[] };

    if (scheduledTask.estimateMinutes) {
      line += ` ${theme.formatEstimate(scheduledTask.estimateMinutes)}`;
    }

    if (scheduledTask.priority !== 5) {
      line += ` ${chalk.yellow(`^${scheduledTask.priority}`)}`;
    }

    if (scheduledTask.scheduledDateTime) {
      line += ` ${chalk.dim(`[${format(scheduledTask.scheduledDateTime, 'MMM d, HH:mm')}]`)}`;
    }
  }

  console.log(line);
}

/**
 * Display a churn task in the selection list
 */
function displayChurnTask(number: number, task: SchedulerTask): void {
  let line = `  ${chalk.cyan(number.toString().padStart(2))}. ${task.title}`;

  if (task.project) {
    line += ` ${theme.formatProject(task.project)}`;
  }

  if (task.tags.length > 0) {
    line += ` ${theme.formatTags(task.tags)}`;
  }

  if (task.estimateMinutes) {
    line += ` ${theme.formatEstimate(task.estimateMinutes)}`;
  }

  if (task.priority && task.priority !== 5) {
    line += ` ${chalk.yellow(`^${task.priority}`)}`;
  }

  if (task.deadline) {
    line += ` ${chalk.dim(`[${format(task.deadline, 'MMM d, HH:mm')}]`)}`;
  }

  console.log(line);
}
