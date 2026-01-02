import { ParseError } from '../types/errors';
import { LogEntry, ParseResult, SessionState } from '../types/session';
import { tokenizeFile, TokenizedLine, TokenType, Token } from './tokenizer';
import { parseDuration } from './duration';
import { parseISO, isValid, differenceInHours, isBefore } from 'date-fns';

/**
 * Parser for converting tokenized log lines into LogEntry objects
 */
export class LogParser {
  private currentDate: Date;
  private entries: LogEntry[] = [];
  private errors: ParseError[] = [];
  private warnings: string[] = [];
  private lastTimestamp?: Date;

  constructor(initialDate: Date = new Date()) {
    // Start with today's date at midnight in local timezone
    this.currentDate = new Date(
      initialDate.getFullYear(),
      initialDate.getMonth(),
      initialDate.getDate(),
      0,
      0,
      0,
      0
    );
  }

  /**
   * Parse a timestamp token into a Date object
   */
  private parseTimestamp(timestampValue: string, lineNumber: number): Date {
    // Check if it includes a date (YYYY-MM-DD HH:MM)
    if (timestampValue.includes('-')) {
      const parsed = parseISO(timestampValue.replace(' ', 'T'));
      if (!isValid(parsed)) {
        throw new ParseError(`Invalid timestamp: "${timestampValue}"`, lineNumber);
      }
      // Update current date context
      this.currentDate = new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        0,
        0,
        0,
        0
      );
      this.lastTimestamp = parsed;
      return parsed;
    }

    // Parse time only (HH:MM or HH:MM:SS)
    const timeMatch = timestampValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!timeMatch) {
      throw new ParseError(`Invalid time format: "${timestampValue}"`, lineNumber);
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;

    // Validate time values
    if (hours > 23 || minutes > 59 || seconds > 59) {
      throw new ParseError(`Invalid time values: "${timestampValue}"`, lineNumber);
    }

    // Create timestamp using current date context
    const timestamp = new Date(this.currentDate);
    timestamp.setHours(hours, minutes, seconds, 0);

    // Check for time underflow (time went backward)
    if (this.lastTimestamp && isBefore(timestamp, this.lastTimestamp)) {
      // Assume next day
      const nextDay = this.currentDate.getDate() + 1;
      this.currentDate = new Date(
        this.currentDate.getFullYear(),
        this.currentDate.getMonth(),
        nextDay,
        0,
        0,
        0,
        0
      );
      timestamp.setDate(nextDay);

      this.warnings.push(
        `Line ${lineNumber}: Time went backward (${timestampValue}), assuming next day`
      );
    }

    // Check for large gaps (> 8 hours)
    if (this.lastTimestamp) {
      const hoursDiff = differenceInHours(timestamp, this.lastTimestamp);
      if (hoursDiff > 8) {
        this.warnings.push(
          `Line ${lineNumber}: Large time gap detected (${hoursDiff} hours)`
        );
      }
    }

    this.lastTimestamp = timestamp;
    return timestamp;
  }

  /**
   * Find a token of specific type in the token list
   */
  private findToken(tokens: Token[], type: TokenType): Token | undefined {
    return tokens.find((t) => t.type === type);
  }

  /**
   * Find all tokens of specific type
   */
  private findAllTokens(tokens: Token[], type: TokenType): Token[] {
    return tokens.filter((t) => t.type === type);
  }

  /**
   * Parse a single tokenized line into a LogEntry
   */
  private parseTokenizedLine(tokenizedLine: TokenizedLine): LogEntry {
    const { tokens, indentLevel, lineNumber } = tokenizedLine;

    // Extract timestamp (required)
    const timestampToken = this.findToken(tokens, TokenType.TIMESTAMP);
    if (!timestampToken) {
      throw new ParseError('Missing timestamp', lineNumber);
    }

    const timestamp = this.parseTimestamp(timestampToken.value, lineNumber);

    // Extract state suffix (if present)
    const stateSuffixToken = this.findToken(tokens, TokenType.STATE_SUFFIX);
    const state = stateSuffixToken?.value as SessionState | undefined;

    // Check for resume marker
    const resumeToken = this.findToken(tokens, TokenType.RESUME_MARKER);
    if (resumeToken) {
      // Extract additional tokens that can appear with @resume
      const descToken = this.findToken(tokens, TokenType.DESCRIPTION);
      const projectToken = this.findToken(tokens, TokenType.PROJECT);
      const tagTokens = this.findAllTokens(tokens, TokenType.TAG);
      const estimateToken = this.findToken(tokens, TokenType.ESTIMATE);
      const durationToken = this.findToken(tokens, TokenType.EXPLICIT_DURATION);

      // Determine description based on resume marker type
      let description: string;
      if (resumeToken.value === 'resume') {
        // @resume keyword - description comes from DESCRIPTION token or will be resolved from database
        if (!descToken && tagTokens.length === 0 && !projectToken) {
          // @resume alone - will find most recent paused task
          description = '';  // Empty signals to log.ts to find paused task
        } else {
          // @resume with task specification - use provided description or first tag
          description = descToken?.value || (tagTokens.length > 0 ? tagTokens[0].value : '');
        }
      } else {
        // @prev or @N - resolve using existing logic
        description = this.resolveResumeMarker(resumeToken.value, lineNumber);
      }

      // Parse estimate if present
      let estimateMinutes: number | undefined;
      if (estimateToken) {
        try {
          estimateMinutes = parseDuration(estimateToken.value);
        } catch (error) {
          if (error instanceof ParseError) {
            throw new ParseError(`Invalid estimate: ${error.message}`, lineNumber);
          }
          throw error;
        }
      }

      // Parse explicit duration if present
      let explicitDurationMinutes: number | undefined;
      if (durationToken) {
        try {
          explicitDurationMinutes = parseDuration(durationToken.value);
        } catch (error) {
          if (error instanceof ParseError) {
            throw new ParseError(`Invalid duration: ${error.message}`, lineNumber);
          }
          throw error;
        }
      }

      return {
        timestamp,
        description,
        project: projectToken?.value,
        tags: tagTokens.map((t) => t.value),
        estimateMinutes,
        explicitDurationMinutes,
        remark: this.findToken(tokens, TokenType.REMARK)?.value,
        indentLevel,
        lineNumber,
        state,
        resumeMarkerValue: resumeToken.value,
      };
    }

    // Check for end marker
    const endToken = this.findToken(tokens, TokenType.END_MARKER);
    if (endToken) {
      // End marker - special entry that marks end of log
      return {
        timestamp,
        description: '__END__',
        tags: [],
        indentLevel: 0, // Always at root level
        lineNumber,
        remark: this.findToken(tokens, TokenType.REMARK)?.value,
      };
    }

    // Check for pause marker
    const pauseToken = this.findToken(tokens, TokenType.PAUSE_MARKER);
    if (pauseToken) {
      // Pause marker - special entry that marks task paused
      return {
        timestamp,
        description: '__PAUSE__',
        tags: [],
        indentLevel: 0, // Always at root level
        lineNumber,
        remark: this.findToken(tokens, TokenType.REMARK)?.value,
      };
    }

    // Check for abandon marker
    const abandonToken = this.findToken(tokens, TokenType.ABANDON_MARKER);
    if (abandonToken) {
      // Abandon marker - special entry that marks task abandoned
      return {
        timestamp,
        description: '__ABANDON__',
        tags: [],
        indentLevel: 0, // Always at root level
        lineNumber,
        remark: this.findToken(tokens, TokenType.REMARK)?.value,
      };
    }

    // Extract description (required if not resume marker, unless tags-only)
    const descToken = this.findToken(tokens, TokenType.DESCRIPTION);
    const tagTokens = this.findAllTokens(tokens, TokenType.TAG);

    // If no description, must have at least one tag
    if (!descToken && tagTokens.length === 0) {
      throw new ParseError('Missing description or tags', lineNumber);
    }

    // Extract project
    const projectToken = this.findToken(tokens, TokenType.PROJECT);
    const project = projectToken?.value;

    // Extract tags
    const tags = tagTokens.map((t) => t.value);

    // If no description, use first tag as description
    const description = descToken?.value || (tags.length > 0 ? tags[0] : '');

    // Extract and parse estimate
    const estimateToken = this.findToken(tokens, TokenType.ESTIMATE);
    let estimateMinutes: number | undefined;
    if (estimateToken) {
      try {
        estimateMinutes = parseDuration(estimateToken.value);
      } catch (error) {
        if (error instanceof ParseError) {
          throw new ParseError(`Invalid estimate: ${error.message}`, lineNumber);
        }
        throw error;
      }
    }

    // Extract and parse explicit duration
    const durationToken = this.findToken(tokens, TokenType.EXPLICIT_DURATION);
    let explicitDurationMinutes: number | undefined;
    if (durationToken) {
      try {
        explicitDurationMinutes = parseDuration(durationToken.value);
      } catch (error) {
        if (error instanceof ParseError) {
          throw new ParseError(`Invalid duration: ${error.message}`, lineNumber);
        }
        throw error;
      }
    }

    // Extract remark
    const remarkToken = this.findToken(tokens, TokenType.REMARK);
    const remark = remarkToken?.value;

    return {
      timestamp,
      description,
      project,
      tags,
      estimateMinutes,
      explicitDurationMinutes,
      remark,
      indentLevel,
      lineNumber,
      state,
    };
  }

  /**
   * Resolve a resume marker to a description
   */
  private resolveResumeMarker(markerValue: string, lineNumber: number): string {
    if (markerValue === 'prev') {
      // Find most recent entry at indent level 0 that's not a break/lunch
      const workEntries = [...this.entries]
        .reverse()
        .filter((e) => e.indentLevel === 0);

      // Skip entries that are tags-only (description came from a tag)
      const prevEntry = workEntries.find((e) => {
        const isTagsOnly = e.tags.includes(e.description);
        return !isTagsOnly;
      });

      if (!prevEntry) {
        throw new ParseError('No previous task to resume', lineNumber);
      }

      return prevEntry.description;
    }

    // Marker is a number - find entry by index (1-based)
    const index = parseInt(markerValue, 10);
    const targetEntry = this.entries.filter((e) => e.indentLevel === 0)[index - 1];

    if (!targetEntry) {
      throw new ParseError(`Task @${markerValue} not found`, lineNumber);
    }

    return targetEntry.description;
  }

  /**
   * Parse a log file content
   */
  parse(content: string): ParseResult {
    const tokenizeResult = tokenizeFile(content);

    // Add tokenization errors to our errors list
    this.errors.push(...tokenizeResult.errors);

    // Process tokenized lines
    for (const tokenizedLine of tokenizeResult.lines) {
      // Skip null entries (empty/comment lines or error lines)
      if (!tokenizedLine) {
        continue;
      }

      try {
        const entry = this.parseTokenizedLine(tokenizedLine);
        this.entries.push(entry);
      } catch (error) {
        if (error instanceof ParseError) {
          this.errors.push(error);
        } else {
          this.errors.push(
            new ParseError(`Unexpected error: ${error}`, tokenizedLine.lineNumber)
          );
        }
      }
    }

    return {
      entries: this.entries,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Static helper to parse log content
   */
  static parse(content: string, initialDate?: Date): ParseResult {
    const parser = new LogParser(initialDate);
    return parser.parse(content);
  }
}
