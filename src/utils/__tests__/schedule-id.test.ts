import { numToLetter, letterToNum } from '../schedule-id';

describe('numToLetter', () => {
  describe('single letters (1-26)', () => {
    it('should convert 1 to "a"', () => {
      expect(numToLetter(1)).toBe('a');
    });

    it('should convert 2 to "b"', () => {
      expect(numToLetter(2)).toBe('b');
    });

    it('should convert 26 to "z"', () => {
      expect(numToLetter(26)).toBe('z');
    });
  });

  describe('double letters (27-702)', () => {
    it('should convert 27 to "aa"', () => {
      expect(numToLetter(27)).toBe('aa');
    });

    it('should convert 28 to "ab"', () => {
      expect(numToLetter(28)).toBe('ab');
    });

    it('should convert 52 to "az"', () => {
      expect(numToLetter(52)).toBe('az');
    });

    it('should convert 53 to "ba"', () => {
      expect(numToLetter(53)).toBe('ba');
    });

    it('should convert 702 to "zz"', () => {
      expect(numToLetter(702)).toBe('zz');
    });
  });

  describe('triple letters (703+)', () => {
    it('should convert 703 to "aaa"', () => {
      expect(numToLetter(703)).toBe('aaa');
    });

    it('should convert 704 to "aab"', () => {
      expect(numToLetter(704)).toBe('aab');
    });
  });

  describe('error handling', () => {
    it('should throw error for 0', () => {
      expect(() => numToLetter(0)).toThrow('ID must be a positive integer');
    });

    it('should throw error for negative numbers', () => {
      expect(() => numToLetter(-1)).toThrow('ID must be a positive integer');
    });
  });
});

describe('letterToNum', () => {
  describe('single letters (1-26)', () => {
    it('should convert "a" to 1', () => {
      expect(letterToNum('a')).toBe(1);
    });

    it('should convert "b" to 2', () => {
      expect(letterToNum('b')).toBe(2);
    });

    it('should convert "z" to 26', () => {
      expect(letterToNum('z')).toBe(26);
    });
  });

  describe('double letters (27-702)', () => {
    it('should convert "aa" to 27', () => {
      expect(letterToNum('aa')).toBe(27);
    });

    it('should convert "ab" to 28', () => {
      expect(letterToNum('ab')).toBe(28);
    });

    it('should convert "az" to 52', () => {
      expect(letterToNum('az')).toBe(52);
    });

    it('should convert "ba" to 53', () => {
      expect(letterToNum('ba')).toBe(53);
    });

    it('should convert "zz" to 702', () => {
      expect(letterToNum('zz')).toBe(702);
    });
  });

  describe('triple letters (703+)', () => {
    it('should convert "aaa" to 703', () => {
      expect(letterToNum('aaa')).toBe(703);
    });

    it('should convert "aab" to 704', () => {
      expect(letterToNum('aab')).toBe(704);
    });
  });

  describe('case insensitivity', () => {
    it('should convert "A" to 1', () => {
      expect(letterToNum('A')).toBe(1);
    });

    it('should convert "AA" to 27', () => {
      expect(letterToNum('AA')).toBe(27);
    });

    it('should convert "AbC" to mixed case correctly', () => {
      expect(letterToNum('AbC')).toBe(letterToNum('abc'));
    });
  });

  describe('error handling', () => {
    it('should throw error for numeric input', () => {
      expect(() => letterToNum('123')).toThrow(
        'Invalid schedule ID "123". Schedule IDs use letters (e.g., \'a\', \'af\'), not numbers. Did you mean `tt edit 123` for a session?'
      );
    });

    it('should throw error for mixed alphanumeric input', () => {
      expect(() => letterToNum('a1')).toThrow(
        'Invalid schedule ID "a1". Schedule IDs use letters (e.g., \'a\', \'af\'), not numbers. Did you mean `tt edit a1` for a session?'
      );
    });

    it('should throw error for special characters', () => {
      expect(() => letterToNum('a-b')).toThrow(/Invalid schedule ID/);
    });

    it('should throw error for empty string', () => {
      expect(() => letterToNum('')).toThrow(/Invalid schedule ID/);
    });
  });
});

describe('round-trip conversion', () => {
  it('should round-trip through both functions', () => {
    for (let i = 1; i <= 1000; i++) {
      const letters = numToLetter(i);
      const num = letterToNum(letters);
      expect(num).toBe(i);
    }
  });
});
