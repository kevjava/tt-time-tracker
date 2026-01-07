/**
 * Session state values
 */
export type SessionState = 'working' | 'paused' | 'completed' | 'abandoned';

/**
 * Represents a time tracking session
 */
export interface Session {
  id?: number;
  startTime: Date;
  endTime?: Date;
  description: string;
  project?: string;
  estimateMinutes?: number;
  explicitDurationMinutes?: number;
  remark?: string;
  state: SessionState;
  parentSessionId?: number;
  continuesSessionId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Represents a tag associated with a session
 */
export interface SessionTag {
  sessionId: number;
  tag: string;
}

/**
 * Represents a scheduled task that can be used as a template
 */
export interface ScheduledTask {
  id?: number;
  description: string;
  project?: string;
  estimateMinutes?: number;
  priority: number; // 1-9, default 5
  scheduledDateTime?: Date;
  createdAt?: Date;
}

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
