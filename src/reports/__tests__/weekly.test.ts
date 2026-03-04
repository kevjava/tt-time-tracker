import { generateWeeklyReport } from '../weekly';
import { SessionWithTags } from '../types';

const WEEK_START = new Date('2024-01-15T00:00:00');
const WEEK_END = new Date('2024-01-21T23:59:59');

function makeReport(sessions: SessionWithTags[]) {
  return generateWeeklyReport(sessions, 'Week of Jan 15', WEEK_START, WEEK_END);
}

describe('calculateSummary (via generateWeeklyReport)', () => {
  describe('no filter — full session set', () => {
    it('keeps project percentage at 100% when child parent is present', () => {
      // fireweb top-level: 9:00–10:00 (60m gross)
      // othertask top-level: 10:00–11:00 (60m gross) containing fireweb interruption 10:15–10:30
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'fireweb work',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'other work',
          project: 'other',
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 3,
          startTime: new Date('2024-01-15T10:15:00'),
          endTime: new Date('2024-01-15T10:30:00'),
          description: 'fireweb interruption',
          project: 'fireweb',
          parentSessionId: 2, // child of 'other' — parent IS in the set
          state: 'completed',
          tags: ['code'],
        },
      ];

      const { summary } = makeReport(sessions);

      // totalMinutes = gross(1) + gross(2) = 60 + 60 = 120
      expect(summary.totalMinutes).toBe(120);

      // fireweb gets: net(1)=60 + net(3)=15 = 75
      const fireweb = summary.byProject.get('fireweb') ?? 0;
      expect(fireweb).toBeLessThanOrEqual(summary.totalMinutes);
    });
  });

  describe('project filter — all sessions belong to project', () => {
    it('gives 100% when every session is in the filtered project', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 1,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'fireweb work',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 2,
          startTime: new Date('2024-01-15T10:00:00'),
          endTime: new Date('2024-01-15T11:00:00'),
          description: 'fireweb work 2',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
      ];

      const { summary } = makeReport(sessions);

      const fireweb = summary.byProject.get('fireweb') ?? 0;
      // Both sessions are top-level; net == gross (no interruptions)
      expect(fireweb).toBeLessThanOrEqual(summary.totalMinutes);
      // And percentage is effectively 100%
      expect(fireweb / summary.totalMinutes).toBeCloseTo(1, 2);
    });
  });

  describe('project filter — orphaned interruption scenario', () => {
    it('keeps percentage ≤ 100% when fireweb interrupts a non-fireweb parent', () => {
      // Simulates `--project fireweb` query result:
      //   • Top-level fireweb session (60m gross, no interruptions → 60m net)
      //   • A fireweb child of a NON-fireweb parent (parent NOT in this list)
      //     The child is 27 minutes long.
      const sessions: SessionWithTags[] = [
        {
          id: 10,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'fireweb top-level',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 20,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T11:27:00'),
          description: 'fireweb interruption of other task',
          project: 'fireweb',
          // parentSessionId 99 is NOT in this sessions array (filtered out)
          parentSessionId: 99,
          state: 'completed',
          tags: ['code'],
        },
      ];

      const { summary } = makeReport(sessions);

      const fireweb = summary.byProject.get('fireweb') ?? 0;

      // Before the fix: totalMinutes = 60, fireweb = 60+27 = 87 → 145%
      // After the fix:  totalMinutes = 60+27 = 87, fireweb = 60+27 = 87 → 100%
      expect(fireweb).toBeLessThanOrEqual(summary.totalMinutes);

      // totalMinutes should now include the orphan's gross duration (27m)
      expect(summary.totalMinutes).toBe(60 + 27);
      expect(fireweb).toBe(60 + 27);
    });

    it('handles multiple orphaned interruptions', () => {
      const sessions: SessionWithTags[] = [
        {
          id: 10,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'fireweb top-level',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 20,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T11:15:00'),
          description: 'fireweb orphan 1',
          project: 'fireweb',
          parentSessionId: 99, // not in set
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 30,
          startTime: new Date('2024-01-15T12:00:00'),
          endTime: new Date('2024-01-15T12:12:00'),
          description: 'fireweb orphan 2',
          project: 'fireweb',
          parentSessionId: 100, // not in set
          state: 'completed',
          tags: ['code'],
        },
      ];

      const { summary } = makeReport(sessions);

      const fireweb = summary.byProject.get('fireweb') ?? 0;

      expect(fireweb).toBeLessThanOrEqual(summary.totalMinutes);
      // totalMinutes = 60 (top-level) + 15 (orphan1) + 12 (orphan2) = 87
      expect(summary.totalMinutes).toBe(60 + 15 + 12);
      expect(fireweb).toBe(60 + 15 + 12);
    });

    it('does not double-count when orphan has its own children in the set', () => {
      // Orphaned parent (id=20, parentSessionId=99 not in set) has a child (id=30, parentSessionId=20 IS in set).
      // id=30 is NOT an orphan because its parent (20) IS present.
      // totalMinutes should add gross(20) once; byProject adds net(20) and net(30).
      const sessions: SessionWithTags[] = [
        {
          id: 10,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'fireweb top-level',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
        {
          // Orphaned: parent 99 not in set; gross = 30m, but has child id=30 (10m)
          id: 20,
          startTime: new Date('2024-01-15T11:00:00'),
          endTime: new Date('2024-01-15T11:30:00'),
          description: 'fireweb orphaned mid-level',
          project: 'fireweb',
          parentSessionId: 99,
          state: 'completed',
          tags: ['code'],
        },
        {
          // Child of id=20 (which IS in set) — not an orphan
          id: 30,
          startTime: new Date('2024-01-15T11:10:00'),
          endTime: new Date('2024-01-15T11:20:00'),
          description: 'fireweb deep child',
          project: 'fireweb',
          parentSessionId: 20,
          state: 'completed',
          tags: ['code'],
        },
      ];

      const { summary } = makeReport(sessions);

      const fireweb = summary.byProject.get('fireweb') ?? 0;
      expect(fireweb).toBeLessThanOrEqual(summary.totalMinutes);

      // id=10: gross=60, net=60 (no children)
      // id=20: orphan, gross=30 added to totalMinutes; net=30-10=20 (child id=30 takes 10m)
      // id=30: not orphan (parent 20 is in set), not added to totalMinutes; net=10
      // totalMinutes = 60 + 30 = 90
      // byProject fireweb = 60 + 20 + 10 = 90
      expect(summary.totalMinutes).toBe(90);
      expect(fireweb).toBe(90);
    });
  });

  describe('tag filter — orphaned interruption scenario', () => {
    it('keeps percentage ≤ 100% when +code session interrupts a non-code parent', () => {
      // Simulates `--tag code` filter result:
      //   • Top-level +code session (60m)
      //   • +code child whose parent was +meeting (not in results)
      const sessions: SessionWithTags[] = [
        {
          id: 10,
          startTime: new Date('2024-01-15T09:00:00'),
          endTime: new Date('2024-01-15T10:00:00'),
          description: 'coding session',
          project: 'fireweb',
          state: 'completed',
          tags: ['code'],
        },
        {
          id: 20,
          startTime: new Date('2024-01-15T10:30:00'),
          endTime: new Date('2024-01-15T10:45:00'),
          description: 'quick code fix during meeting',
          project: 'fireweb',
          parentSessionId: 99, // meeting session, not in filtered set
          state: 'completed',
          tags: ['code'],
        },
      ];

      const { summary } = makeReport(sessions);

      const codeMins = summary.byTag.get('code') ?? 0;
      expect(codeMins).toBeLessThanOrEqual(summary.totalMinutes);
      expect(summary.totalMinutes).toBe(60 + 15);
      expect(codeMins).toBe(60 + 15);
    });
  });
});
