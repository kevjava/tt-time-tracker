import { Session } from '../types/session';

/**
 * A session with tags for reporting
 */
export type SessionWithTags = Session & { tags: string[] };

/**
 * Context switch severity
 */
export type SwitchSeverity = 'hard' | 'medium' | 'soft' | 'none';

/**
 * A context switch between two sessions
 */
export interface ContextSwitch {
  from: SessionWithTags;
  to: SessionWithTags;
  severity: SwitchSeverity;
  timestamp: Date;
}

/**
 * Summary of time spent
 */
export interface TimeSummary {
  totalMinutes: number;
  byProject: Map<string, number>;
  byTag: Map<string, number>;
}

/**
 * Context switching metrics
 */
export interface ContextSwitchMetrics {
  totalSwitches: number;
  hardSwitches: number;
  mediumSwitches: number;
  softSwitches: number;
  switches: ContextSwitch[];
  mostFragmentedDays: Array<{
    date: string;
    switches: number;
  }>;
}

/**
 * Efficiency metrics
 */
export interface EfficiencyMetrics {
  grossMinutes: number;
  interruptionMinutes: number;
  netProductiveMinutes: number;
  efficiencyRatio: number;
}

/**
 * Deep work session
 */
export interface DeepWorkSession {
  session: SessionWithTags;
  durationMinutes: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Focus block metrics
 */
export interface FocusBlockMetrics {
  deepWorkSessions: DeepWorkSession[];
  totalDeepWorkMinutes: number;
  averageSessionLength: number;
  morningFocusByDay: Map<string, number>;
}

/**
 * Estimate accuracy metrics
 */
export interface EstimateAccuracyMetrics {
  averageError: number;
  averageErrorPercent: number;
  worstMisses: Array<{
    session: SessionWithTags;
    estimateMinutes: number;
    actualMinutes: number;
    errorPercent: number;
  }>;
  totalEstimated: number;
  totalActual: number;
}

/**
 * Statistical outlier
 */
export interface Outlier {
  session: SessionWithTags;
  durationMinutes: number;
  deviationFromMean: number;
}

/**
 * Complete weekly report
 */
export interface WeeklyReport {
  weekLabel: string;
  startDate: Date;
  endDate: Date;
  summary: TimeSummary;
  contextSwitches: ContextSwitchMetrics;
  efficiency: EfficiencyMetrics;
  focusBlocks: FocusBlockMetrics;
  estimateAccuracy: EstimateAccuracyMetrics | null;
  outliers: Outlier[];
}
