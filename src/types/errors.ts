/**
 * Base error class for TT time tracker
 */
export class TTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when parsing fails
 */
export class ParseError extends TTError {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    const location = line !== undefined ? ` at line ${line}` : '';
    super(`${message}${location}`);
  }
}

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends TTError {}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends TTError {}
