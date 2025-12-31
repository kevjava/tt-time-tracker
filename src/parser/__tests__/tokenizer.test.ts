import {
  tokenizeLine,
  tokenizeFile,
  isCommentLine,
  isEmptyLine,
  getIndentLevel,
  TokenType,
} from '../tokenizer';
import { ParseError } from '../../types/errors';

describe('isCommentLine', () => {
  it('should identify comment lines', () => {
    expect(isCommentLine('# This is a comment')).toBe(true);
    expect(isCommentLine('  # Indented comment')).toBe(true);
    expect(isCommentLine('\t# Tab comment')).toBe(true);
  });

  it('should not identify non-comments', () => {
    expect(isCommentLine('09:00 task # remark')).toBe(false);
    expect(isCommentLine('09:00 task')).toBe(false);
  });
});

describe('isEmptyLine', () => {
  it('should identify empty lines', () => {
    expect(isEmptyLine('')).toBe(true);
    expect(isEmptyLine('   ')).toBe(true);
    expect(isEmptyLine('\t\t')).toBe(true);
  });

  it('should not identify non-empty lines', () => {
    expect(isEmptyLine('09:00 task')).toBe(false);
    expect(isEmptyLine('  # comment')).toBe(false);
  });
});

describe('getIndentLevel', () => {
  it('should measure indentation', () => {
    expect(getIndentLevel('no indent')).toBe(0);
    expect(getIndentLevel('  two spaces')).toBe(2);
    expect(getIndentLevel('    four spaces')).toBe(4);
    expect(getIndentLevel('\tone tab')).toBe(1);
  });
});

describe('tokenizeLine', () => {
  describe('valid lines', () => {
    it('should tokenize simple task', () => {
      const result = tokenizeLine('09:00 morning standup', 1);
      expect(result).not.toBeNull();
      expect(result!.tokens).toHaveLength(2);
      expect(result!.tokens[0]).toMatchObject({
        type: TokenType.TIMESTAMP,
        value: '09:00',
      });
      expect(result!.tokens[1]).toMatchObject({
        type: TokenType.DESCRIPTION,
        value: 'morning standup',
      });
    });

    it('should tokenize task with project', () => {
      const result = tokenizeLine('09:00 standup @projectX', 1);
      expect(result!.tokens).toHaveLength(3);
      expect(result!.tokens[0].type).toBe(TokenType.TIMESTAMP);
      expect(result!.tokens[1].type).toBe(TokenType.DESCRIPTION);
      expect(result!.tokens[2]).toMatchObject({
        type: TokenType.PROJECT,
        value: 'projectX',
      });
    });

    it('should tokenize task with multiple tags', () => {
      const result = tokenizeLine('09:00 standup +meeting +daily', 1);
      expect(result!.tokens).toHaveLength(4);
      expect(result!.tokens[2]).toMatchObject({
        type: TokenType.TAG,
        value: 'meeting',
      });
      expect(result!.tokens[3]).toMatchObject({
        type: TokenType.TAG,
        value: 'daily',
      });
    });

    it('should tokenize task with estimate', () => {
      const result = tokenizeLine('09:00 fix bug ~2h', 1);
      expect(result!.tokens).toHaveLength(3);
      expect(result!.tokens[2]).toMatchObject({
        type: TokenType.ESTIMATE,
        value: '2h',
      });
    });

    it('should tokenize task with explicit duration', () => {
      const result = tokenizeLine('09:00 walked dog (20m)', 1);
      expect(result!.tokens).toHaveLength(3);
      expect(result!.tokens[2]).toMatchObject({
        type: TokenType.EXPLICIT_DURATION,
        value: '20m',
      });
    });

    it('should tokenize task with remark', () => {
      const result = tokenizeLine('09:00 fix bug # struggling with tests', 1);
      expect(result!.tokens).toHaveLength(3);
      expect(result!.tokens[2]).toMatchObject({
        type: TokenType.REMARK,
        value: 'struggling with tests',
      });
    });

    it('should tokenize task with all features', () => {
      const result = tokenizeLine(
        '09:00 fix bug @projectX +code +urgent ~2h (45m) # found the issue',
        1
      );
      expect(result!.tokens).toHaveLength(8);
      expect(result!.tokens[0].type).toBe(TokenType.TIMESTAMP);
      expect(result!.tokens[1].type).toBe(TokenType.DESCRIPTION);
      expect(result!.tokens[2].type).toBe(TokenType.PROJECT);
      expect(result!.tokens[3].type).toBe(TokenType.TAG);
      expect(result!.tokens[4].type).toBe(TokenType.TAG);
      expect(result!.tokens[5].type).toBe(TokenType.ESTIMATE);
      expect(result!.tokens[6].type).toBe(TokenType.EXPLICIT_DURATION);
      expect(result!.tokens[7].type).toBe(TokenType.REMARK);
    });

    it('should handle timestamp with seconds', () => {
      const result = tokenizeLine('09:00:15 task', 1);
      expect(result!.tokens[0]).toMatchObject({
        type: TokenType.TIMESTAMP,
        value: '09:00:15',
      });
    });

    it('should handle timestamp with date', () => {
      const result = tokenizeLine('2024-12-24 09:00 task', 1);
      expect(result!.tokens[0]).toMatchObject({
        type: TokenType.TIMESTAMP,
        value: '2024-12-24 09:00',
      });
    });

    it('should handle resume marker @prev', () => {
      const result = tokenizeLine('12:48 @prev', 1);
      expect(result!.tokens).toHaveLength(2);
      expect(result!.tokens[1]).toMatchObject({
        type: TokenType.RESUME_MARKER,
        value: 'prev',
      });
    });

    it('should handle resume marker @N', () => {
      const result = tokenizeLine('12:48 @5', 1);
      expect(result!.tokens).toHaveLength(2);
      expect(result!.tokens[1]).toMatchObject({
        type: TokenType.RESUME_MARKER,
        value: '5',
      });
    });

    it('should handle resume marker with remark', () => {
      const result = tokenizeLine('12:48 @prev # back to work', 1);
      expect(result!.tokens).toHaveLength(3);
      expect(result!.tokens[1].type).toBe(TokenType.RESUME_MARKER);
      expect(result!.tokens[2].type).toBe(TokenType.REMARK);
    });

    it('should detect indentation', () => {
      const result = tokenizeLine('  10:37 walked dog', 1);
      expect(result!.indentLevel).toBe(2);
    });

    it('should handle extra whitespace', () => {
      const result = tokenizeLine('09:00  task  @project  +tag', 1);
      expect(result!.tokens).toHaveLength(4);
    });
  });

  describe('invalid lines', () => {
    it('should return null for empty lines', () => {
      expect(tokenizeLine('', 1)).toBeNull();
      expect(tokenizeLine('   ', 1)).toBeNull();
    });

    it('should return null for comment lines', () => {
      expect(tokenizeLine('# This is a comment', 1)).toBeNull();
      expect(tokenizeLine('  # Indented comment', 1)).toBeNull();
    });

    it('should reject line without timestamp', () => {
      expect(() => tokenizeLine('just a task', 1)).toThrow(ParseError);
      expect(() => tokenizeLine('just a task', 1)).toThrow('Missing or invalid timestamp');
    });

    it('should allow tags-only or project-only entries', () => {
      // Tags-only entries are now allowed
      const result1 = tokenizeLine('09:00 +tag', 1);
      expect(result1!.tokens).toHaveLength(2); // timestamp + tag

      // Project-only is not meaningful (would need description or tags)
      const result2 = tokenizeLine('09:00 @project', 1);
      expect(result2!.tokens).toHaveLength(2); // timestamp + project (description is empty)
    });

    it('should reject # without space', () => {
      expect(() => tokenizeLine('09:00 task #no-space', 1)).toThrow(ParseError);
      expect(() => tokenizeLine('09:00 task #no-space', 1)).toThrow('must have space after #');
    });

    it('should accept timestamp format but may have invalid values', () => {
      // Timestamp value validation happens in grammar parser, not tokenizer
      const result1 = tokenizeLine('25:00 task', 1);
      expect(result1!.tokens[0].value).toBe('25:00');

      const result2 = tokenizeLine('9:00 task', 1);
      expect(result2!.tokens[0].value).toBe('9:00');
    });

    it('should reject malformed project', () => {
      expect(() => tokenizeLine('09:00 task @', 1)).toThrow(ParseError);
    });

    it('should reject malformed tag', () => {
      expect(() => tokenizeLine('09:00 task +', 1)).toThrow(ParseError);
    });

    it('should reject malformed estimate', () => {
      expect(() => tokenizeLine('09:00 task ~', 1)).toThrow(ParseError);
    });

    it('should reject malformed explicit duration', () => {
      expect(() => tokenizeLine('09:00 task (2h', 1)).toThrow(ParseError);

      // "2h)" without opening paren becomes part of description
      const result = tokenizeLine('09:00 task 2h)', 1);
      expect(result!.tokens[1].value).toBe('task 2h)');
    });
  });
});

describe('tokenizeFile', () => {
  it('should tokenize multiple lines', () => {
    const content = `# Monday
09:00 standup @project +meeting
09:15 coding @project +code

10:00 break +downtime`;

    const result = tokenizeFile(content);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(5);
    expect(result.lines[0]).toBeNull(); // comment
    expect(result.lines[1]).not.toBeNull(); // standup
    expect(result.lines[2]).not.toBeNull(); // coding
    expect(result.lines[3]).toBeNull(); // empty
    expect(result.lines[4]).not.toBeNull(); // break
  });

  it('should collect errors and continue processing', () => {
    const content = `09:00 valid task
invalid line
10:00 another task`;

    const result = tokenizeFile(content);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('line 2');
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]).not.toBeNull(); // valid task
    expect(result.lines[1]).toBeNull(); // error line
    expect(result.lines[2]).not.toBeNull(); // another task
  });
});

describe('state suffix tokens', () => {
  it('should tokenize ->paused suffix', () => {
    const result = tokenizeLine('09:00 Task one ->paused', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.TIMESTAMP, value: '09:00' }),
        expect.objectContaining({ type: TokenType.DESCRIPTION, value: 'Task one' }),
        expect.objectContaining({ type: TokenType.STATE_SUFFIX, value: 'paused' }),
      ])
    );
  });

  it('should tokenize ->completed suffix', () => {
    const result = tokenizeLine('09:00 Task two ->completed', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.STATE_SUFFIX, value: 'completed' }),
      ])
    );
  });

  it('should tokenize ->abandoned suffix', () => {
    const result = tokenizeLine('09:00 Task three ->abandoned', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.STATE_SUFFIX, value: 'abandoned' }),
      ])
    );
  });

  it('should tokenize state suffix after explicit duration', () => {
    const result = tokenizeLine('09:00 Task @project +tag (30m) ->paused', 1);
    expect(result).not.toBeNull();
    const tokens = result!.tokens;
    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.EXPLICIT_DURATION, value: '30m' }),
        expect.objectContaining({ type: TokenType.STATE_SUFFIX, value: 'paused' }),
      ])
    );
  });

  it('should tokenize state suffix before remark', () => {
    const result = tokenizeLine('09:00 Task ->paused # comment', 1);
    expect(result).not.toBeNull();
    const tokens = result!.tokens;
    const stateSuffixIdx = tokens.findIndex((t) => t.type === TokenType.STATE_SUFFIX);
    const remarkIdx = tokens.findIndex((t) => t.type === TokenType.REMARK);
    expect(stateSuffixIdx).toBeLessThan(remarkIdx);
  });

  it('should reject invalid state suffix', () => {
    expect(() => tokenizeLine('09:00 Task ->invalid', 1)).toThrow(ParseError);
  });

  it('should not include state suffix in description', () => {
    const result = tokenizeLine('09:00 Task one ->paused', 1);
    expect(result).not.toBeNull();
    const descToken = result!.tokens.find((t) => t.type === TokenType.DESCRIPTION);
    expect(descToken?.value).toBe('Task one');
    expect(descToken?.value).not.toContain('->');
  });
});

describe('@resume keyword', () => {
  it('should tokenize @resume keyword', () => {
    const result = tokenizeLine('09:00 @resume', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.RESUME_MARKER, value: 'resume' }),
      ])
    );
  });

  it('should tokenize @resume with task description', () => {
    const result = tokenizeLine('09:00 @resume Feature work @project +code', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.RESUME_MARKER, value: 'resume' }),
        expect.objectContaining({ type: TokenType.DESCRIPTION, value: 'Feature work' }),
        expect.objectContaining({ type: TokenType.PROJECT, value: 'project' }),
        expect.objectContaining({ type: TokenType.TAG, value: 'code' }),
      ])
    );
  });

  it('should tokenize @resume with state suffix', () => {
    const result = tokenizeLine('09:00 @resume Task @project ->paused', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.RESUME_MARKER, value: 'resume' }),
        expect.objectContaining({ type: TokenType.STATE_SUFFIX, value: 'paused' }),
      ])
    );
  });

  it('should still tokenize @prev', () => {
    const result = tokenizeLine('09:00 @prev', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.RESUME_MARKER, value: 'prev' }),
      ])
    );
  });

  it('should still tokenize @N', () => {
    const result = tokenizeLine('09:00 @2', 1);
    expect(result).not.toBeNull();
    expect(result!.tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: TokenType.RESUME_MARKER, value: '2' }),
      ])
    );
  });
});
