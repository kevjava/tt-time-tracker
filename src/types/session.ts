/**
 * Re-export core types from tt-core
 */
export {
  Session,
  SessionWithTags,
  SessionState,
  SessionTag,
  TTScheduledTask,
  TTScheduledTaskWithTags,
} from '@kevjava/tt-core';

/**
 * Alias for backward compatibility - ScheduledTask is TTScheduledTask from tt-core
 */
import { TTScheduledTask, TTScheduledTaskWithTags, SessionState } from '@kevjava/tt-core';
export type ScheduledTask = TTScheduledTask;
export type ScheduledTaskWithTags = TTScheduledTaskWithTags;

/**
 * Parsed log entry before DB insertion
 */
export interface LogEntry {
  timestamp: Date;
  description: string;
  project?: string;
  tags: string[];
  estimateMinutes?: number;
  explicitDurationMinutes?: number;
  priority?: number;
  remark?: string;
  indentLevel: number;
  lineNumber: number;
  state?: SessionState;
  resumeMarkerValue?: string;
}

/**
 * Result of parsing a log file
 */
export interface ParseResult {
  entries: LogEntry[];
  errors: ParseError[];
  warnings: string[];
}

/**
 * Import of parse error from errors module
 */
import { ParseError } from './errors';
