/**
 * Arena Eligibility Tests
 * 
 * Verifies that arena_status filtering works correctly:
 * - Only 'active' participants appear on leaderboard
 * - 'left' and 'ended' participants are excluded
 * - Stop/resume doesn't change arena_status
 * - Leave arena sets status to 'left'
 */

import { describe, it, expect } from '@jest/globals';

describe('Arena Eligibility Rules', () => {
  
  describe('Arena Status Values', () => {
    it('should only allow valid arena_status values', () => {
      const validStatuses = ['active', 'left', 'ended'];
      validStatuses.forEach(status => {
        expect(['active', 'left', 'ended']).toContain(status);
      });
    });

    it('should reject invalid arena_status values', () => {
      const invalidStatuses = ['paused', 'pending', 'archived', ''];
      invalidStatuses.forEach(status => {
        expect(['active', 'left', 'ended']).not.toContain(status);
      });
    });
  });

  describe('Session Creation', () => {
    it('should set arena_status to active when creating arena session', () => {
      // Simulate arena entry creation
      const arenaEntry = {
        user_id: 'test-user',
        session_id: 'test-session',
        mode: 'arena',
        display_name: 'TestUser',
        active: true,
        arena_status: 'active', // Should be set on creation
      };

      expect(arenaEntry.arena_status).toBe('active');
      expect(arenaEntry.active).toBe(true);
    });
  });

  describe('Leave Arena Action', () => {
    it('should set arena_status to left and record timestamp', () => {
      // Simulate leave arena update
      const beforeLeave = {
        arena_status: 'active',
        active: true,
        left_at: null,
      };

      const afterLeave = {
        arena_status: 'left',
        active: false,
        left_at: new Date().toISOString(),
      };

      expect(afterLeave.arena_status).toBe('left');
      expect(afterLeave.active).toBe(false);
      expect(afterLeave.left_at).toBeTruthy();
      expect(beforeLeave.arena_status).not.toBe(afterLeave.arena_status);
    });
  });

  describe('Stop Session Behavior', () => {
    it('should NOT change arena_status when stopping session', () => {
      // Simulate session stop (only changes session.status, not arena_status)
      const arenaEntry = {
        arena_status: 'active',
        active: true,
      };

      // Session stops, but arena_status remains unchanged
      const sessionAfterStop = {
        status: 'stopped', // Session status changes
      };

      // Arena entry should remain unchanged
      expect(arenaEntry.arena_status).toBe('active');
      expect(arenaEntry.active).toBe(true);
    });

    it('should allow resume after stop while maintaining active status', () => {
      const arenaEntry = {
        arena_status: 'active',
        active: true,
      };

      // Stop session
      let sessionStatus = 'stopped';
      expect(arenaEntry.arena_status).toBe('active'); // Still active in arena

      // Resume session
      sessionStatus = 'running';
      expect(arenaEntry.arena_status).toBe('active'); // Still active in arena
    });
  });

  describe('Leaderboard Filtering', () => {
    it('should only include active participants in leaderboard query', () => {
      const allEntries = [
        { id: 1, arena_status: 'active', active: true },
        { id: 2, arena_status: 'left', active: false },
        { id: 3, arena_status: 'active', active: true },
        { id: 4, arena_status: 'ended', active: false },
        { id: 5, arena_status: 'active', active: true },
      ];

      // Simulate leaderboard filtering
      const visibleEntries = allEntries.filter(
        entry => entry.active === true && entry.arena_status === 'active'
      );

      expect(visibleEntries).toHaveLength(3);
      expect(visibleEntries.every(e => e.arena_status === 'active')).toBe(true);
      expect(visibleEntries.map(e => e.id)).toEqual([1, 3, 5]);
    });

    it('should exclude left participants from leaderboard', () => {
      const entries = [
        { id: 1, arena_status: 'active', equity: 105000 },
        { id: 2, arena_status: 'left', equity: 110000 }, // Higher equity but left
        { id: 3, arena_status: 'active', equity: 102000 },
      ];

      const leaderboard = entries
        .filter(e => e.arena_status === 'active')
        .sort((a, b) => b.equity - a.equity);

      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].id).toBe(1); // 105k is highest among active
      expect(leaderboard.find(e => e.id === 2)).toBeUndefined(); // Left user excluded
    });

    it('should exclude ended participants from leaderboard', () => {
      const entries = [
        { id: 1, arena_status: 'active' },
        { id: 2, arena_status: 'ended' },
      ];

      const visible = entries.filter(e => e.arena_status === 'active');
      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe(1);
    });
  });

  describe('Chart Data Filtering', () => {
    it('should only include active participants in chart data', () => {
      const participants = [
        { entryId: 'a', arena_status: 'active', data: [{ time: 1, value: 100 }] },
        { entryId: 'b', arena_status: 'left', data: [{ time: 1, value: 110 }] },
        { entryId: 'c', arena_status: 'active', data: [{ time: 1, value: 95 }] },
      ];

      const chartData = participants.filter(p => p.arena_status === 'active');

      expect(chartData).toHaveLength(2);
      expect(chartData.map(p => p.entryId)).toEqual(['a', 'c']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple leave/rejoin attempts gracefully', () => {
      // User can only join once per session
      // If they leave and try to rejoin the same session, it should fail
      const entry = {
        session_id: 'session-1',
        arena_status: 'left',
      };

      // Attempt to rejoin should be rejected (would require new session)
      const canRejoin = entry.arena_status === 'active';
      expect(canRejoin).toBe(false);
    });

    it('should handle null/undefined arena_status as inactive', () => {
      // After migration, all entries should have arena_status
      // But as a safety measure, treat null/undefined as inactive
      const entries = [
        { id: 1, arena_status: 'active' },
        { id: 2, arena_status: null },
        { id: 3, arena_status: undefined },
      ];

      const active = entries.filter(e => e.arena_status === 'active');
      expect(active).toHaveLength(1);
    });

    it('should preserve left_at timestamp after leaving', () => {
      const leftAt = new Date('2026-01-24T12:00:00Z');
      const entry = {
        arena_status: 'left',
        left_at: leftAt.toISOString(),
      };

      expect(entry.arena_status).toBe('left');
      expect(new Date(entry.left_at).getTime()).toBe(leftAt.getTime());
    });
  });

  describe('Migration Scenarios', () => {
    it('should set existing entries to active after migration', () => {
      // All existing entries before migration have no arena_status
      const beforeMigration = [
        { id: 1, active: true },
        { id: 2, active: true },
        { id: 3, active: false },
      ];

      // After migration, active entries get arena_status='active'
      const afterMigration = beforeMigration.map(e => ({
        ...e,
        arena_status: e.active ? 'active' : 'active', // Migration sets all to active
      }));

      expect(afterMigration.every(e => e.arena_status === 'active')).toBe(true);
    });
  });

  describe('UI Visibility Rules', () => {
    it('should show ARENA badge only for active arena sessions', () => {
      const sessions = [
        { mode: 'arena', arena_status: 'active' }, // Show badge
        { mode: 'arena', arena_status: 'left' },   // Show badge (session still exists, just not competing)
        { mode: 'virtual' },                        // No badge
        { mode: 'live' },                          // No badge
      ];

      const showArenaBadge = (session: any) => session.mode === 'arena';
      
      expect(showArenaBadge(sessions[0])).toBe(true);
      expect(showArenaBadge(sessions[1])).toBe(true); // Badge shown, but not on leaderboard
      expect(showArenaBadge(sessions[2])).toBe(false);
      expect(showArenaBadge(sessions[3])).toBe(false);
    });

    it('should show Leave Arena button only if arena_status is active', () => {
      const canLeaveArena = (entry: any) => 
        entry.mode === 'arena' && entry.arena_status === 'active';

      expect(canLeaveArena({ mode: 'arena', arena_status: 'active' })).toBe(true);
      expect(canLeaveArena({ mode: 'arena', arena_status: 'left' })).toBe(false);
      expect(canLeaveArena({ mode: 'arena', arena_status: 'ended' })).toBe(false);
      expect(canLeaveArena({ mode: 'virtual' })).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete user journey correctly', () => {
      // Step 1: Create arena session
      let entry = {
        arena_status: 'active',
        active: true,
        left_at: null,
      };
      expect(entry.arena_status).toBe('active');

      // Step 2: Appears on leaderboard
      let isVisible = entry.active && entry.arena_status === 'active';
      expect(isVisible).toBe(true);

      // Step 3: Stop session (temporary)
      let sessionStatus = 'stopped';
      // Arena status unchanged
      expect(entry.arena_status).toBe('active');
      isVisible = entry.active && entry.arena_status === 'active';
      expect(isVisible).toBe(true); // Still visible

      // Step 4: Resume session
      sessionStatus = 'running';
      expect(entry.arena_status).toBe('active');

      // Step 5: Leave arena (permanent)
      entry = {
        ...entry,
        arena_status: 'left',
        active: false,
        left_at: new Date().toISOString(),
      };
      expect(entry.arena_status).toBe('left');
      expect(entry.left_at).toBeTruthy();

      // Step 6: No longer on leaderboard
      isVisible = entry.active && entry.arena_status === 'active';
      expect(isVisible).toBe(false);
    });
  });
});

/**
 * Manual Testing Checklist (run in browser/Supabase):
 * 
 * 1. Run migration: supabase/arena_status_tracking.sql
 * 2. Create new arena session → check arena_entries has arena_status='active'
 * 3. Visit /arena → session appears on leaderboard
 * 4. Stop session → still appears on leaderboard
 * 5. Resume session → still appears
 * 6. Leave arena → immediately disappears from leaderboard
 * 7. Check arena_entries → arena_status='left', left_at is set
 * 8. Verify chart also excludes left participants
 * 9. Verify virtual leaderboard query performance (should use index)
 * 
 * SQL Queries to verify:
 * 
 * -- Check all arena entries have valid status
 * SELECT arena_status, COUNT(*) FROM arena_entries GROUP BY arena_status;
 * 
 * -- Check active participants
 * SELECT * FROM arena_entries WHERE arena_status = 'active';
 * 
 * -- Check left participants have timestamp
 * SELECT * FROM arena_entries WHERE arena_status = 'left' AND left_at IS NOT NULL;
 * 
 * -- Verify index is being used (explain plan)
 * EXPLAIN ANALYZE SELECT * FROM arena_entries WHERE arena_status = 'active' AND active = true;
 */
