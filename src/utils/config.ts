import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * Get the data directory for TT time tracker
 * Respects TT_DATA_DIR environment variable
 */
export function getDataDir(): string {
  const customDir = process.env.TT_DATA_DIR;

  if (customDir) {
    return customDir;
  }

  // Default to ~/.local/share/tt
  const home = homedir();
  return join(home, '.local', 'share', 'tt');
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  return join(getDataDir(), 'tt.db');
}

/**
 * Ensure data directory exists
 */
export function ensureDataDir(): void {
  const dataDir = getDataDir();

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Get the editor command from environment
 * Falls back to vi if neither EDITOR nor VISUAL is set
 */
export function getEditor(): string {
  return process.env.EDITOR || process.env.VISUAL || 'vi';
}
