import chalk from 'chalk';
import * as readline from 'readline';
import { format } from 'date-fns';
import { TimeTrackerDB } from '../../db/database';
import { ScheduledTask } from '../../types/session';
import * as theme from '../../utils/theme';

interface SelectionItem {
  globalNumber: number;
  task: ScheduledTask & { tags: string[] };
  category: 'oldest' | 'important' | 'urgent';
}

/**
 * Present interactive selection UI and return selected task
 * Returns null if no tasks available or user cancels
 */
export async function promptScheduledTaskSelection(
  db: TimeTrackerDB
): Promise<(ScheduledTask & { tags: string[] }) | null> {
  const categories = db.getScheduledTasksForSelection();

  // Check if any tasks exist
  if (categories.oldest.length === 0) {
    return null;
  }

  // Build selection list with globally unique numbers
  const items: SelectionItem[] = [];
  let globalNumber = 1;

  // Track which tasks have been shown (by ID) to display with consistent numbers
  const taskNumberMap = new Map<number, number>();

  // Oldest stanza
  console.log(chalk.bold('\nOldest Tasks:'));
  for (const task of categories.oldest) {
    items.push({ globalNumber, task, category: 'oldest' });
    taskNumberMap.set(task.id!, globalNumber);
    displayTask(globalNumber, task);
    globalNumber++;
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

function displayTask(number: number, task: ScheduledTask & { tags: string[] }): void {
  let line = `  ${chalk.cyan(number.toString().padStart(2))}. ${task.description}`;

  if (task.project) {
    line += ` ${theme.formatProject(task.project)}`;
  }

  if (task.tags.length > 0) {
    line += ` ${theme.formatTags(task.tags)}`;
  }

  if (task.estimateMinutes) {
    line += ` ${theme.formatEstimate(task.estimateMinutes)}`;
  }

  if (task.priority !== 5) {
    line += ` ${chalk.yellow(`^${task.priority}`)}`;
  }

  if (task.scheduledDateTime) {
    line += ` ${chalk.dim(`[${format(task.scheduledDateTime, 'MMM d, HH:mm')}]`)}`;
  }

  console.log(line);
}
