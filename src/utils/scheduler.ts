import { TaskScheduler } from '@kevjava/task-parser';
import { TTScheduler, TTDatabase } from '@kevjava/tt-core';
import { ChurnScheduler, Database as ChurnDatabase } from '@kevjava/churn-core';
import { UserConfig } from '../types/config';
import { expandPath } from './config';

/**
 * Create a scheduler based on configuration.
 *
 * If churn.enabled is true, returns a ChurnScheduler that uses priority curves
 * and recurrence patterns. Otherwise, returns a TTScheduler with simple FIFO ordering.
 */
export async function getScheduler(config: UserConfig, ttDb: TTDatabase): Promise<TaskScheduler> {
  if (config.churn?.enabled) {
    const churnDbPath = expandPath(config.churn.db_path ?? '~/.config/churn/churn.db');
    const churnDb = new ChurnDatabase(churnDbPath);
    return new ChurnScheduler(churnDb);
  }
  return new TTScheduler(ttDb);
}

/**
 * Check if churn integration is enabled
 */
export function isChurnEnabled(config: UserConfig): boolean {
  return config.churn?.enabled === true;
}
