import { SessionWithTags, DeepWorkSession, FocusBlockMetrics } from '../types';
import { getDateKey } from '../../utils/date';
import { getNetSessionDuration } from '../../utils/duration';

/**
 * Check if a session qualifies as deep work
 * - Net duration (after subtracting interruptions) >= 90 minutes
 * - Must have an end time (completed session)
 */
function isDeepWork(
  session: SessionWithTags,
  allSessions: SessionWithTags[]
): boolean {
  if (!session.endTime) {
    return false;
  }

  // Use net duration (gross duration minus interruption time)
  const netDuration = getNetSessionDuration(session, allSessions);

  return netDuration >= 90;
}

/**
 * Build a chronological timeline of work sessions including interruptions
 * This creates a sequence showing what you're actively working on at each moment
 */
function buildWorkTimeline(sessions: SessionWithTags[]): Array<{ session: SessionWithTags; startTime: Date; endTime: Date | null }> {
  type Event = {
    time: Date;
    type: 'start' | 'end';
    session: SessionWithTags;
  };

  const events: Event[] = [];

  for (const session of sessions) {
    events.push({ time: session.startTime, type: 'start', session });
    if (session.endTime) {
      events.push({ time: session.endTime, type: 'end', session });
    }
  }

  // Sort events chronologically
  events.sort((a, b) => a.time.getTime() - b.time.getTime());

  // Walk through events and build timeline segments
  const sessionStack: SessionWithTags[] = [];
  const timeline: Array<{ session: SessionWithTags; startTime: Date; endTime: Date | null }> = [];
  let currentSegmentStart: Date | null = null;
  let currentSession: SessionWithTags | null = null;

  for (const event of events) {
    if (event.type === 'start') {
      // If we were working on something, end that segment
      if (currentSession && currentSegmentStart) {
        timeline.push({
          session: currentSession,
          startTime: currentSegmentStart,
          endTime: event.time,
        });
      }

      // Start new segment with this session
      sessionStack.push(event.session);
      currentSession = sessionStack[sessionStack.length - 1];
      currentSegmentStart = event.time;
    } else {
      // End event
      const index = sessionStack.findIndex((s) => s.id === event.session.id);
      if (index !== -1) {
        sessionStack.splice(index, 1);
      }

      // End current segment
      if (currentSession && currentSegmentStart) {
        timeline.push({
          session: currentSession,
          startTime: currentSegmentStart,
          endTime: event.time,
        });
      }

      // What are we working on now?
      if (sessionStack.length > 0) {
        currentSession = sessionStack[sessionStack.length - 1];
        currentSegmentStart = event.time;
      } else {
        currentSession = null;
        currentSegmentStart = null;
      }
    }
  }

  // Handle any remaining segment
  if (currentSession && currentSegmentStart) {
    timeline.push({
      session: currentSession,
      startTime: currentSegmentStart,
      endTime: null,
    });
  }

  return timeline;
}

/**
 * Check if two sessions represent a context switch
 */
function isContextSwitch(from: SessionWithTags, to: SessionWithTags): boolean {
  // Breaks don't count as context switches
  const breakTags = ['lunch', 'break', 'downtime', 'coffee'];
  const isFromBreak = from.tags.some((tag) => breakTags.includes(tag.toLowerCase()));
  const isToBreak = to.tags.some((tag) => breakTags.includes(tag.toLowerCase()));

  if (isFromBreak || isToBreak) {
    return false;
  }

  // Different project or no overlapping tags = context switch
  const isSameProject = from.project === to.project;
  const hasSameTag = to.tags.some((tag) => from.tags.includes(tag));

  return !isSameProject || !hasSameTag;
}

/**
 * Calculate time to first context switch each day
 */
function calculateMorningFocus(sessions: SessionWithTags[]): Map<string, number> {
  const morningFocusByDay = new Map<string, number>();

  // Build timeline including interruptions
  const timeline = buildWorkTimeline(sessions);

  // Group timeline segments by day
  const segmentsByDay = new Map<string, typeof timeline>();

  for (const segment of timeline) {
    const dayKey = getDateKey(segment.startTime);
    if (!segmentsByDay.has(dayKey)) {
      segmentsByDay.set(dayKey, []);
    }
    segmentsByDay.get(dayKey)!.push(segment);
  }

  // For each day, calculate time to first context switch
  for (const [dayKey, daySegments] of segmentsByDay) {
    if (daySegments.length === 0) {
      continue;
    }

    // Sort by start time
    daySegments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Accumulate time until first context switch
    let focusMinutes = 0;

    for (let i = 0; i < daySegments.length; i++) {
      const segment = daySegments[i];

      if (i > 0) {
        // Check if this is a context switch from previous segment
        const prevSegment = daySegments[i - 1];
        if (isContextSwitch(prevSegment.session, segment.session)) {
          // Found first switch, stop accumulating
          break;
        }
      }

      // Add this segment's duration
      if (segment.endTime) {
        const durationMs = segment.endTime.getTime() - segment.startTime.getTime();
        focusMinutes += durationMs / (1000 * 60);
      }
    }

    morningFocusByDay.set(dayKey, Math.round(focusMinutes));
  }

  return morningFocusByDay;
}

/**
 * Calculate focus block metrics
 */
export function calculateFocusBlocks(sessions: SessionWithTags[]): FocusBlockMetrics {
  const deepWorkSessions: DeepWorkSession[] = [];

  // Find deep work sessions
  for (const session of sessions) {
    if (!session.parentSessionId && isDeepWork(session, sessions)) {
      // Use net duration (gross minus interruptions) for tracking
      const durationMinutes = getNetSessionDuration(session, sessions);
      deepWorkSessions.push({
        session,
        durationMinutes,
        startTime: session.startTime,
        endTime: session.endTime!,
      });
    }
  }

  const totalDeepWorkMinutes = deepWorkSessions.reduce((sum, dws) => sum + dws.durationMinutes, 0);
  const averageSessionLength = deepWorkSessions.length > 0 ? totalDeepWorkMinutes / deepWorkSessions.length : 0;

  const morningFocusByDay = calculateMorningFocus(sessions);

  return {
    deepWorkSessions,
    totalDeepWorkMinutes,
    averageSessionLength,
    morningFocusByDay,
  };
}
