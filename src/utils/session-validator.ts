import chalk from 'chalk';
import { TimeTrackerDB } from '../db/database';
import { Session } from '../types/session';
import { parseAtTime, validateNotFuture, validateTimeOrder } from './time-parser';

const AUTO_ADJUST_THRESHOLD_MS = 60000; // 60 seconds

/**
 * Validate and parse a time for starting a new session
 * Auto-adjusts start time if overlap is less than 60 seconds
 */
export function validateStartTime(
  atTime: string | undefined,
  db: TimeTrackerDB
): Date {
  const startTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(startTime);

  // Check for overlapping sessions
  const overlappingSession = db.getOverlappingSession(startTime, null);
  if (overlappingSession) {
    // If the overlapping session has no end time (still active), we can't auto-adjust
    if (!overlappingSession.endTime) {
      throw new Error(
        `Cannot start session at ${startTime.toLocaleString()} - it would overlap with an active session. ` +
        `Stop or complete the active session first.`
      );
    }

    // Check if overlap is less than threshold (60 seconds)
    const overlapMs = overlappingSession.endTime.getTime() - startTime.getTime();
    if (overlapMs > 0 && overlapMs < AUTO_ADJUST_THRESHOLD_MS) {
      const adjustedTime = new Date(overlappingSession.endTime.getTime() + 1000);

      // Check that adjusted time is not in the future
      validateNotFuture(adjustedTime);

      console.warn(
        chalk.yellow(
          `Note: Adjusted start time from ${startTime.toLocaleTimeString()} to ${adjustedTime.toLocaleTimeString()} to avoid overlap with previous session`
        )
      );
      return adjustedTime;
    }

    // Overlap is too large, throw error
    throw new Error(
      `Cannot start session at ${startTime.toLocaleString()} - it would overlap with an existing session. ` +
      `Stop or complete the conflicting session first.`
    );
  }

  return startTime;
}

/**
 * Validate and parse a time for stopping a session
 */
export function validateStopTime(
  atTime: string | undefined,
  activeSession: Session
): Date {
  const stopTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(stopTime);

  // Validate that stop time is after start time
  validateTimeOrder(activeSession.startTime, stopTime);

  return stopTime;
}

/**
 * Validate and parse a time for interrupting a session
 * Auto-adjusts interrupt time if overlap is less than 60 seconds
 */
export function validateInterruptTime(
  atTime: string | undefined,
  activeSession: Session,
  db: TimeTrackerDB
): Date {
  const interruptTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(interruptTime);

  // Validate that interrupt time is after the active session's start time
  validateTimeOrder(activeSession.startTime, interruptTime);

  // Check for overlapping sessions (excluding the active session being interrupted)
  const overlappingSession = db.getOverlappingSession(interruptTime, null, activeSession.id);
  if (overlappingSession) {
    // If the overlapping session has no end time (still active), we can't auto-adjust
    if (!overlappingSession.endTime) {
      throw new Error(
        `Cannot start interruption at ${interruptTime.toLocaleString()} - it would overlap with an active session.`
      );
    }

    // Check if overlap is less than threshold (60 seconds)
    const overlapMs = overlappingSession.endTime.getTime() - interruptTime.getTime();
    if (overlapMs > 0 && overlapMs < AUTO_ADJUST_THRESHOLD_MS) {
      const adjustedTime = new Date(overlappingSession.endTime.getTime() + 1000);

      // Check that adjusted time is not in the future
      validateNotFuture(adjustedTime);

      // Also verify adjusted time is still after the active session's start time
      validateTimeOrder(activeSession.startTime, adjustedTime);

      console.warn(
        chalk.yellow(
          `Note: Adjusted start time from ${interruptTime.toLocaleTimeString()} to ${adjustedTime.toLocaleTimeString()} to avoid overlap with previous session`
        )
      );
      return adjustedTime;
    }

    // Overlap is too large, throw error
    throw new Error(
      `Cannot start interruption at ${interruptTime.toLocaleString()} - it would overlap with an existing session.`
    );
  }

  return interruptTime;
}

/**
 * Validate and parse a time for resuming from an interruption
 */
export function validateResumeTime(
  atTime: string | undefined,
  activeSession: Session
): Date {
  const resumeTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(resumeTime);

  // Validate that resume time is after the interruption's start time
  validateTimeOrder(activeSession.startTime, resumeTime);

  return resumeTime;
}

/**
 * Validate and parse a time for abandoning a session
 */
export function validateAbandonTime(
  atTime: string | undefined,
  activeSession: Session
): Date {
  const abandonTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(abandonTime);

  // Validate that abandon time is after start time
  validateTimeOrder(activeSession.startTime, abandonTime);

  return abandonTime;
}

/**
 * Validate and parse a time for pausing a session
 */
export function validatePauseTime(
  atTime: string | undefined,
  activeSession: Session
): Date {
  const pauseTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(pauseTime);

  // Validate that pause time is after start time
  validateTimeOrder(activeSession.startTime, pauseTime);

  return pauseTime;
}
