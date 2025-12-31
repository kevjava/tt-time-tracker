import { LogParser } from '../grammar';

describe('LogParser', () => {
  describe('basic parsing', () => {
    it('should parse simple task', () => {
      const content = '09:00 morning standup';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        description: 'morning standup',
        tags: [],
        indentLevel: 0,
        lineNumber: 1,
      });
      expect(result.entries[0].timestamp.getHours()).toBe(9);
      expect(result.entries[0].timestamp.getMinutes()).toBe(0);
    });

    it('should parse task with project', () => {
      const content = '09:00 standup @projectX';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].project).toBe('projectX');
    });

    it('should parse task with multiple tags', () => {
      const content = '09:00 standup +meeting +daily';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].tags).toEqual(['meeting', 'daily']);
    });

    it('should parse task with estimate', () => {
      const content = '09:00 fix bug ~2h';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].estimateMinutes).toBe(120);
    });

    it('should parse task with explicit duration', () => {
      const content = '09:00 walked dog (20m)';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].explicitDurationMinutes).toBe(20);
    });

    it('should parse task with remark', () => {
      const content = '09:00 fix bug # struggling with tests';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].remark).toBe('struggling with tests');
    });

    it('should parse task with all features', () => {
      const content = '09:00 fix bug @projectX +code +urgent ~2h (45m) # found it';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0]).toMatchObject({
        description: 'fix bug',
        project: 'projectX',
        tags: ['code', 'urgent'],
        estimateMinutes: 120,
        explicitDurationMinutes: 45,
        remark: 'found it',
      });
    });
  });

  describe('timestamp handling', () => {
    it('should parse timestamp with seconds', () => {
      const content = '09:00:15 task';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].timestamp.getSeconds()).toBe(15);
    });

    it('should parse timestamp with explicit date', () => {
      const content = '2024-12-25 09:00 task';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      const ts = result.entries[0].timestamp;
      expect(ts.getFullYear()).toBe(2024);
      expect(ts.getMonth()).toBe(11); // December (0-indexed)
      expect(ts.getDate()).toBe(25);
      expect(ts.getHours()).toBe(9);
    });

    it('should maintain date context across entries', () => {
      const content = `09:00 task one
10:00 task two
11:00 task three`;
      const testDate = new Date(2024, 11, 24); // Month is 0-indexed
      const result = LogParser.parse(content, testDate);

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].timestamp.getDate()).toBe(24);
      expect(result.entries[1].timestamp.getDate()).toBe(24);
      expect(result.entries[2].timestamp.getDate()).toBe(24);
    });

    it('should handle time underflow (cross midnight)', () => {
      const content = `22:00 late task
01:00 early task`;
      const testDate = new Date(2024, 11, 24); // Month is 0-indexed
      const result = LogParser.parse(content, testDate);

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].timestamp.getDate()).toBe(24);
      expect(result.entries[1].timestamp.getDate()).toBe(25); // Next day
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Time went backward');
    });

    it('should warn on large time gaps', () => {
      const content = `09:00 task one
18:00 task two`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Large time gap');
    });

    it('should validate time values', () => {
      const content = '25:00 invalid task';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid time values');
    });
  });

  describe('resume markers', () => {
    it('should resolve @prev', () => {
      const content = `09:00 coding @projectX +code
10:00 +break
11:00 @prev`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[2].description).toBe('coding');
    });

    it('should resolve @N', () => {
      const content = `09:00 task one
10:00 task two
11:00 task three
12:00 @2`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[3].description).toBe('task two');
    });

    it('should error if @prev has no previous task', () => {
      const content = '09:00 @prev';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('No previous task');
    });

    it('should error if @N not found', () => {
      const content = `09:00 task one
10:00 @5`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('not found');
    });

    it('should allow resume marker with remark', () => {
      const content = `09:00 coding @projectX
10:00 +break
11:00 @prev # back to work`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[2].description).toBe('coding');
      expect(result.entries[2].remark).toBe('back to work');
    });
  });

  describe('state markers', () => {
    it('should parse @end marker', () => {
      const content = `09:00 coding @projectX +code
10:00 code review
15:30 @end`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[2].description).toBe('__END__');
      expect(result.entries[2].indentLevel).toBe(0);
      expect(result.entries[2].tags).toEqual([]);
      expect(result.entries[2].timestamp.getHours()).toBe(15);
      expect(result.entries[2].timestamp.getMinutes()).toBe(30);
    });

    it('should allow @end with remark', () => {
      const content = `09:00 coding
15:30 @end # done for the day`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries[1].description).toBe('__END__');
      expect(result.entries[1].remark).toBe('done for the day');
    });

    it('should parse @pause marker', () => {
      const content = `09:00 fix authentication bug +code
11:00 @pause # waiting for design review`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[1].description).toBe('__PAUSE__');
      expect(result.entries[1].indentLevel).toBe(0);
      expect(result.entries[1].tags).toEqual([]);
      expect(result.entries[1].remark).toBe('waiting for design review');
    });

    it('should parse @abandon marker', () => {
      const content = `09:00 attempt refactoring +code
10:30 @abandon # approach won't work`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[1].description).toBe('__ABANDON__');
      expect(result.entries[1].indentLevel).toBe(0);
      expect(result.entries[1].tags).toEqual([]);
      expect(result.entries[1].remark).toBe('approach won\'t work');
    });

    it('should handle @end as only entry', () => {
      const content = '15:30 @end';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].description).toBe('__END__');
    });

    it('should handle multiple state markers in log', () => {
      const content = `2024-12-24 09:00 morning work
12:00 @end

2024-12-25 14:00 afternoon work
15:00 @pause

2024-12-26 09:00 failed experiment
10:00 @abandon`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(6);
      expect(result.entries[1].description).toBe('__END__');
      expect(result.entries[3].description).toBe('__PAUSE__');
      expect(result.entries[5].description).toBe('__ABANDON__');
    });
  });

  describe('indentation (interruptions)', () => {
    it('should track indentation level', () => {
      const content = `09:00 main task
  10:00 interruption
11:00 back to main`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].indentLevel).toBe(0);
      expect(result.entries[1].indentLevel).toBe(2);
      expect(result.entries[2].indentLevel).toBe(0);
    });
  });

  describe('comments and empty lines', () => {
    it('should skip comment lines', () => {
      const content = `# This is a comment
09:00 task one
# Another comment
10:00 task two`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(2);
    });

    it('should skip empty lines', () => {
      const content = `09:00 task one

10:00 task two`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should collect multiple errors', () => {
      const content = `invalid line
09:00 valid task
another invalid`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors.length).toBeGreaterThan(0);
      // Parser continues even with errors, so we might have entries
      const validEntries = result.entries.filter((e) => e.description === 'valid task');
      expect(validEntries).toHaveLength(1);
    });

    it('should report line numbers in errors', () => {
      const content = `09:00 task
invalid line
10:00 another task`;
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('line 2');
    });

    it('should error on invalid estimate format', () => {
      const content = '09:00 task ~invalid';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Invalid estimate');
    });

    it('should error on invalid duration format', () => {
      const content = '09:00 task (invalid)';
      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('duration');
    });
  });

  describe('complex example', () => {
    it('should parse complex log file', () => {
      const content = `# Monday, Dec 24, 2024
09:00 morning standup @projectX +meeting
09:15 fix unit tests @projectX +code ~2h # struggling with mock setup
  10:37 walked dog +downtime (20m)
12:10 +lunch
12:48 @prev # found the issue, race condition
  14:02 teams call w/ joe @projectY +meeting (29m)
15:30 deploy to staging @projectX +deploy +ops`;

      const result = LogParser.parse(content, new Date('2024-12-24'));

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(7);

      // Check first entry
      expect(result.entries[0]).toMatchObject({
        description: 'morning standup',
        project: 'projectX',
        tags: ['meeting'],
        indentLevel: 0,
      });

      // Check interruption
      expect(result.entries[2]).toMatchObject({
        description: 'walked dog',
        tags: ['downtime'],
        explicitDurationMinutes: 20,
        indentLevel: 2,
      });

      // Check resume marker
      expect(result.entries[4].description).toBe('fix unit tests');
      expect(result.entries[4].remark).toBe('found the issue, race condition');
    });
  });

  describe('state suffix parsing', () => {
    it('should parse ->paused state suffix', () => {
      const content = '09:00 Task one ->paused';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].state).toBe('paused');
    });

    it('should parse ->completed state suffix', () => {
      const content = '09:00 Task two ->completed';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].state).toBe('completed');
    });

    it('should parse ->abandoned state suffix', () => {
      const content = '09:00 Task three ->abandoned';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].state).toBe('abandoned');
    });

    it('should parse state suffix with other tokens', () => {
      const content = '09:00 Feature work @project +code ~2h (30m) ->paused # comment';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        description: 'Feature work',
        project: 'project',
        tags: ['code'],
        estimateMinutes: 120,
        explicitDurationMinutes: 30,
        state: 'paused',
        remark: 'comment',
      });
    });

    it('should not set state if no suffix provided', () => {
      const content = '09:00 Task without suffix';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].state).toBeUndefined();
    });
  });

  describe('@resume marker parsing', () => {
    it('should parse @resume alone', () => {
      const content = '09:00 @resume';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].resumeMarkerValue).toBe('resume');
      expect(result.entries[0].description).toBe('');
    });

    it('should parse @resume with task description', () => {
      const content = '09:00 @resume Feature work @project +code';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].resumeMarkerValue).toBe('resume');
      expect(result.entries[0].description).toBe('Feature work');
      expect(result.entries[0].project).toBe('project');
      expect(result.entries[0].tags).toEqual(['code']);
    });

    it('should parse @resume with state suffix', () => {
      const content = '09:00 @resume Task name ->paused';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].resumeMarkerValue).toBe('resume');
      expect(result.entries[0].state).toBe('paused');
    });

    it('should parse @resume with estimate', () => {
      const content = '09:00 @resume Feature work ~3h';
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].resumeMarkerValue).toBe('resume');
      expect(result.entries[0].estimateMinutes).toBe(180);
    });

    it('should still support @prev', () => {
      const content = `09:00 coding @projectX +code
10:00 @prev`;
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[1].resumeMarkerValue).toBe('prev');
      expect(result.entries[1].description).toBe('coding');
    });

    it('should still support @N', () => {
      const content = `09:00 task one
10:00 task two
11:00 @1`;
      const result = LogParser.parse(content);
      expect(result.entries).toHaveLength(3);
      expect(result.entries[2].resumeMarkerValue).toBe('1');
      expect(result.entries[2].description).toBe('task one');
    });
  });
});
