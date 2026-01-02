import chalk from 'chalk';
import { SessionState } from '../types/session';

/**
 * Central color theme for TT time tracker
 *
 * This module provides a consistent color language across all screens:
 * - Projects are always cyan with @ prefix
 * - Tags are always magenta with + prefix
 * - Estimates are always blue with ~ prefix
 * - Durations are always default color (white)
 * - Remarks are always italic gray with # prefix
 */

// ============================================================================
// SEMANTIC COLORS (context-dependent)
// ============================================================================

export const semantic = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  debug: chalk.gray,
};

// ============================================================================
// STATE COLORS (for session states)
// ============================================================================

export const state = {
  working: chalk.yellow,
  paused: chalk.gray,
  completed: chalk.green,
  abandoned: chalk.red,
};

// ============================================================================
// ELEMENT COLORS (consistent across all output)
// ============================================================================

const element = {
  project: chalk.cyan,
  tag: chalk.magenta,
  estimate: chalk.blue,
  duration: (text: string) => text, // Default color (white) for readability
  remark: (text: string) => chalk.gray(chalk.italic(text)),
  description: chalk.bold,
};

// ============================================================================
// UI ELEMENT COLORS
// ============================================================================

export const ui = {
  header: (text: string) => chalk.bold(chalk.cyan(text)),
  separator: chalk.gray,
  secondary: chalk.gray,
  dim: chalk.dim,
  highlight: chalk.cyan,
  progressFilled: chalk.green,
  progressEmpty: chalk.gray,
};

// ============================================================================
// FORMATTING HELPER FUNCTIONS
// ============================================================================

/**
 * Format project name with color and prefix
 */
export function formatProject(project: string): string {
  return element.project(`@${project}`);
}

/**
 * Format single tag with color and prefix
 */
export function formatTag(tag: string): string {
  return element.tag(`+${tag}`);
}

/**
 * Format array of tags with color and prefix, joined with spaces
 */
export function formatTags(tags: string[]): string {
  return tags.map(formatTag).join(' ');
}

/**
 * Format duration in minutes to human-readable string
 * Uses default color (white) for maximum readability
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return element.duration(`${mins}m`);
  }

  if (mins === 0) {
    return element.duration(`${hours}h`);
  }

  return element.duration(`${hours}h ${mins}m`);
}

/**
 * Format estimate with color and prefix
 */
export function formatEstimate(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let durationStr: string;
  if (hours > 0) {
    durationStr = mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  } else {
    durationStr = `${mins}m`;
  }

  return element.estimate(`~${durationStr}`);
}

/**
 * Format remark with color and prefix
 */
export function formatRemark(remark: string): string {
  return element.remark(`# ${remark}`);
}

/**
 * Format session state with colored icon and text
 */
export function formatState(sessionState: SessionState): string {
  const icons: Record<SessionState, string> = {
    working: '▶',
    paused: '⏸',
    completed: '✓',
    abandoned: '✗',
  };

  const icon = icons[sessionState];
  const colorFn = state[sessionState];

  return colorFn(`${icon} ${sessionState.charAt(0).toUpperCase() + sessionState.slice(1)}`);
}

/**
 * Format state icon only (without text)
 */
export function formatStateIcon(sessionState: SessionState): string {
  const icons: Record<SessionState, string> = {
    working: '▶',
    paused: '⏸',
    completed: '✓',
    abandoned: '✗',
  };

  const icon = icons[sessionState];
  const colorFn = state[sessionState];

  return colorFn(icon);
}

/**
 * Create a progress bar
 */
export function progressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return ui.progressFilled('█'.repeat(filled)) + ui.progressEmpty('░'.repeat(empty));
}
