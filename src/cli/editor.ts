import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync, statSync } from 'fs';
import { getEditor } from '../utils/config';

/**
 * Result of editor invocation
 */
export interface EditorResult {
  modified: boolean;
  content: string;
}

/**
 * Open a file in the user's editor
 * Returns true if the file was modified, false if unchanged or user aborted
 */
export function openInEditor(filePath: string): EditorResult {
  const editor = getEditor();

  // Get original file stats
  const originalStats = statSync(filePath);
  const originalMtime = originalStats.mtime.getTime();

  // Open editor
  const result = spawnSync(editor, [filePath], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.error) {
    throw new Error(`Failed to open editor: ${result.error.message}`);
  }

  // Check if file was modified
  const newStats = statSync(filePath);
  const newMtime = newStats.mtime.getTime();

  const modified = newMtime !== originalMtime;
  const content = readFileSync(filePath, 'utf-8');

  return { modified, content };
}

/**
 * Create a temporary file with content and open in editor
 * Useful for editing content that's not yet in a file
 */
export function editContent(content: string, tempFilePath: string): EditorResult {
  // Write content to temp file
  writeFileSync(tempFilePath, content, 'utf-8');

  // Open in editor
  return openInEditor(tempFilePath);
}
