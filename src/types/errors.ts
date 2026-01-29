/**
 * Re-export error classes from tt-core
 */
export { TTError, DatabaseError, ValidationError } from '@kevjava/tt-core';

import { TTError } from '@kevjava/tt-core';

/**
 * Error thrown when parsing fails (tt-time-tracker specific)
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
