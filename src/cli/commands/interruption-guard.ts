import chalk from 'chalk';
import { Session } from '../../types/session';

/**
 * Check if the active session is an interruption and exit with an error if so.
 * This prevents commands like `next`, `switch`, and `resume` from leaving the parent task
 * in an inconsistent state.
 */
export function checkNotInInterruption(
  activeSession: (Session & { tags: string[] }) | null,
  command: 'next' | 'switch' | 'resume'
): void {
  if (activeSession?.parentSessionId) {
    console.error(
      chalk.red(
        `Error: Currently in an interruption "${activeSession.description}". ` +
        `Use \`tt resume\` to end the interruption first, then run \`tt ${command}\`.`
      )
    );
    process.exit(1);
  }
}
