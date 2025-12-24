import { ParseError } from '../types/errors';

/**
 * Token types recognized by the parser
 */
export enum TokenType {
  TIMESTAMP = 'TIMESTAMP',
  DESCRIPTION = 'DESCRIPTION',
  PROJECT = 'PROJECT',
  TAG = 'TAG',
  ESTIMATE = 'ESTIMATE',
  EXPLICIT_DURATION = 'EXPLICIT_DURATION',
  REMARK = 'REMARK',
  RESUME_MARKER = 'RESUME_MARKER',
}

/**
 * Represents a parsed token
 */
export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Result of tokenizing a line
 */
export interface TokenizedLine {
  tokens: Token[];
  indentLevel: number;
  lineNumber: number;
  rawLine: string;
}

/**
 * Extract indentation level from a line
 */
export function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Check if a line is a comment (starts with # after optional whitespace)
 */
export function isCommentLine(line: string): boolean {
  return /^\s*#/.test(line);
}

/**
 * Check if a line is empty or whitespace-only
 */
export function isEmptyLine(line: string): boolean {
  return line.trim().length === 0;
}

/**
 * Tokenize a single line of log file
 *
 * @param line - The line to tokenize
 * @param lineNumber - Line number for error reporting
 * @returns TokenizedLine object
 */
export function tokenizeLine(line: string, lineNumber: number): TokenizedLine | null {
  // Skip empty lines
  if (isEmptyLine(line)) {
    return null;
  }

  // Skip comment lines
  if (isCommentLine(line)) {
    return null;
  }

  const indentLevel = getIndentLevel(line);
  const trimmedLine = line.trim();
  const tokens: Token[] = [];

  // Track position in the trimmed line
  let remaining = trimmedLine;
  let position = 0;

  // 1. Extract timestamp (required, must be first)
  const timestampMatch = remaining.match(/^(\d{4}-\d{2}-\d{2}\s+)?\d{1,2}:\d{2}(:\d{2})?/);
  if (!timestampMatch) {
    throw new ParseError('Missing or invalid timestamp', lineNumber);
  }

  tokens.push({
    type: TokenType.TIMESTAMP,
    value: timestampMatch[0],
    position,
  });

  position += timestampMatch[0].length;
  remaining = remaining.slice(timestampMatch[0].length).trim();

  // 2. Check for resume marker (@prev or @N)
  const resumeMatch = remaining.match(/^@(prev|\d+)(?:\s|$)/);
  if (resumeMatch) {
    tokens.push({
      type: TokenType.RESUME_MARKER,
      value: resumeMatch[1],
      position,
    });

    position += resumeMatch[0].length;
    remaining = remaining.slice(resumeMatch[0].length).trim();
  } else {
    // 3. Extract description (everything before special markers)
    // Build description by consuming tokens until we hit a special marker or end of line
    let description = '';
    let descPosition = position;

    while (remaining.length > 0) {
      // Check for special markers that end the description
      if (
        remaining.match(/^@[a-zA-Z0-9_-]+/) || // project
        remaining.match(/^\+[a-zA-Z0-9_-]+/) || // tag
        remaining.match(/^~\d/) || // estimate
        remaining.match(/^\(\d/) || // explicit duration
        remaining.match(/^#\s/) // remark (must have space)
      ) {
        break;
      }

      // Check for invalid special characters
      if (remaining[0] === '@') {
        throw new ParseError('Invalid project format', lineNumber);
      }
      if (remaining[0] === '+') {
        throw new ParseError('Invalid tag format', lineNumber);
      }
      if (remaining[0] === '~') {
        throw new ParseError('Invalid estimate format', lineNumber);
      }
      if (remaining[0] === '(') {
        throw new ParseError('Invalid explicit duration format', lineNumber);
      }

      // Check for invalid # without space (error)
      if (remaining.match(/^#[^\s]/)) {
        throw new ParseError('Remark must have space after #', lineNumber);
      }

      // Consume one character into description
      description += remaining[0];
      remaining = remaining.slice(1);
      position++;
    }

    description = description.trim();

    // Only add description token if we have one
    if (description.length > 0) {
      tokens.push({
        type: TokenType.DESCRIPTION,
        value: description,
        position: descPosition,
      });
    }
  }

  // 4. Extract remaining tokens (project, tags, estimate, duration, remark)
  while (remaining.length > 0) {
    const char = remaining[0];

    if (char === '@') {
      // Project
      const projectMatch = remaining.match(/^@([a-zA-Z0-9_-]+)/);
      if (!projectMatch) {
        throw new ParseError('Invalid project format', lineNumber);
      }

      tokens.push({
        type: TokenType.PROJECT,
        value: projectMatch[1],
        position,
      });

      position += projectMatch[0].length;
      remaining = remaining.slice(projectMatch[0].length).trim();
    } else if (char === '+') {
      // Tag
      const tagMatch = remaining.match(/^\+([a-zA-Z0-9_-]+)/);
      if (!tagMatch) {
        throw new ParseError('Invalid tag format', lineNumber);
      }

      tokens.push({
        type: TokenType.TAG,
        value: tagMatch[1],
        position,
      });

      position += tagMatch[0].length;
      remaining = remaining.slice(tagMatch[0].length).trim();
    } else if (char === '~') {
      // Estimate
      const estimateMatch = remaining.match(/^~([0-9hm]+)/);
      if (!estimateMatch) {
        throw new ParseError('Invalid estimate format', lineNumber);
      }

      tokens.push({
        type: TokenType.ESTIMATE,
        value: estimateMatch[1],
        position,
      });

      position += estimateMatch[0].length;
      remaining = remaining.slice(estimateMatch[0].length).trim();
    } else if (char === '(') {
      // Explicit duration
      const durationMatch = remaining.match(/^\(([0-9hm]+)\)/);
      if (!durationMatch) {
        throw new ParseError('Invalid explicit duration format', lineNumber);
      }

      tokens.push({
        type: TokenType.EXPLICIT_DURATION,
        value: durationMatch[1],
        position,
      });

      position += durationMatch[0].length;
      remaining = remaining.slice(durationMatch[0].length).trim();
    } else if (char === '#') {
      // Remark (must have space after)
      if (!remaining.match(/^#\s/)) {
        throw new ParseError('Remark must have space after #', lineNumber);
      }

      // Remark is everything after "# "
      const remarkText = remaining.slice(2);
      tokens.push({
        type: TokenType.REMARK,
        value: remarkText,
        position,
      });

      // Remark consumes rest of line
      break;
    } else {
      throw new ParseError(`Unexpected character: "${char}"`, lineNumber);
    }
  }

  return {
    tokens,
    indentLevel,
    lineNumber,
    rawLine: line,
  };
}

/**
 * Result of tokenizing a file
 */
export interface TokenizeResult {
  lines: (TokenizedLine | null)[];
  errors: ParseError[];
}

/**
 * Tokenize an entire log file
 *
 * @param content - File content
 * @returns TokenizeResult with tokenized lines and any errors
 */
export function tokenizeFile(content: string): TokenizeResult {
  const lines = content.split('\n');
  const tokenizedLines: (TokenizedLine | null)[] = [];
  const errors: ParseError[] = [];

  lines.forEach((line, index) => {
    try {
      tokenizedLines.push(tokenizeLine(line, index + 1));
    } catch (error) {
      if (error instanceof ParseError) {
        errors.push(error);
      } else {
        errors.push(new ParseError(`Unexpected error: ${error}`, index + 1));
      }
      // Push null for error lines so we maintain line number alignment
      tokenizedLines.push(null);
    }
  });

  return { lines: tokenizedLines, errors };
}
