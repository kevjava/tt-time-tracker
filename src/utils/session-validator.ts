import { TimeTrackerDB } from '../db/database';
import { Session } from '../types/session';
import { parseAtTime, validateNotFuture, validateTimeOrder } from './time-parser';

/**
 * Validate and parse a time for starting a new session
 */
export function validateStartTime(
  atTime: string | undefined,
  db: TimeTrackerDB
): Date {
  const startTime = atTime ? parseAtTime(atTime) : new Date();

  // Validate not in future
  validateNotFuture(startTime);

  // Check for overlapping sessions
  if (db.hasOverlappingSession(startTime, null)) {
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
  if (db.hasOverlappingSession(interruptTime, null, activeSession.id)) {
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
