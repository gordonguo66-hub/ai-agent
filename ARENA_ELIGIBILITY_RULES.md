# Arena Eligibility Rules

## Overview
This document defines how Arena participation status is tracked and enforced to ensure only active participants appear on the leaderboard and charts.

## Arena Status Field

### Database Schema
```sql
arena_entries.arena_status VARCHAR(20) CHECK (arena_status IN ('active', 'left', 'ended'))
arena_entries.left_at TIMESTAMPTZ
```

### Status Values

#### 1. **active** (Default)
- **When**: Session is created with `mode = "arena"`
- **Meaning**: Participant is actively competing in the arena
- **Leaderboard**: ✅ Appears on leaderboard and charts
- **Can resume after stop**: Yes

#### 2. **left** (User action)
- **When**: User clicks "Leave Arena" button
- **Meaning**: User voluntarily left the competition
- **Leaderboard**: ❌ Removed from leaderboard and charts immediately
- **Can rejoin**: No (would need to start a new arena session)
- **Timestamp**: `left_at` is set to current time

#### 3. **ended** (Future use - session completion)
- **When**: Session ends naturally or is deleted
- **Meaning**: Competition has concluded for this participant
- **Leaderboard**: ❌ Not shown on active leaderboard
- **Note**: Reserved for future "historical view" feature

## User Actions and Behavior

### Start Arena Session
```
POST /api/sessions { mode: "arena" }
↓
arena_entries.insert({
  arena_status: 'active',
  active: true
})
↓
Appears on leaderboard immediately
```

### Stop Session (Temporary)
```
PATCH /api/sessions/:id/control { status: "stopped" }
↓
Session stops ticking (no new trades)
↓
⚠️ arena_status remains 'active'
↓
Still appears on leaderboard with frozen equity
↓
User can resume and continue competing
```

**Rationale**: "Stop" is a temporary pause. The user is still in the competition, just not actively trading at the moment.

### Leave Arena (Permanent)
```
POST /api/arena/leave { sessionId }
↓
arena_entries.update({
  arena_status: 'left',
  left_at: NOW(),
  active: false
})
↓
Removed from leaderboard and charts immediately
↓
Session can still run, but not competing in arena
```

**Rationale**: "Leave Arena" is permanent removal from competition. User's results won't be tracked or displayed.

## Leaderboard Filtering

### Virtual Leaderboard (`/api/arena/virtual`)
```sql
SELECT * FROM arena_entries
WHERE mode = 'virtual'
  AND active = true
  AND arena_status = 'active'  -- NEW: Only active participants
ORDER BY equity DESC
```

### Chart Data (`/api/arena/chart`)
```sql
SELECT * FROM arena_entries
WHERE mode = :mode
  AND active = true
  AND arena_status = 'active'  -- NEW: Only active participants
JOIN equity_points ON ...
```

## Migration Instructions

### Step 1: Run Migration
Run `supabase/arena_status_tracking.sql` in Supabase SQL Editor:
- Adds `arena_status` column with default 'active'
- Adds `left_at` timestamp column
- Updates all existing entries to 'active'
- Creates indexes for efficient filtering

### Step 2: Verify Existing Data
```sql
-- All existing arena entries should be 'active' after migration
SELECT COUNT(*), arena_status 
FROM arena_entries 
GROUP BY arena_status;

-- Expected: All rows have arena_status = 'active'
```

### Step 3: Test Flow
1. Create new arena session → `arena_status = 'active'`
2. Check leaderboard → appears
3. Stop session → still appears (status still 'active')
4. Resume session → still appears
5. Leave arena → disappears (`arena_status = 'left'`)

## UI Copy Updates

### Session Controls (when `mode === "arena"`)
```tsx
// Stop button tooltip
"Temporarily stop trading. You'll remain in the arena competition."

// Leave Arena button
"Leave Arena"
// Dialog:
"Are you sure you want to leave the arena? You will be removed from the leaderboard and cannot rejoin this session."
```

### Arena Page
```tsx
// Leaderboard header
"Active Arena Participants"

// Empty state
"No active arena participants yet. Start an arena session to compete!"
```

## Testing Checklist

- [ ] New arena session appears on leaderboard with `arena_status = 'active'`
- [ ] Stopping session does NOT remove from leaderboard
- [ ] Resuming stopped session keeps it on leaderboard
- [ ] Leaving arena removes from leaderboard immediately
- [ ] Left session has `left_at` timestamp
- [ ] Chart data excludes left participants
- [ ] Database constraint prevents invalid status values
- [ ] Migration works on existing data

## Future Enhancements

### Historical View (Optional)
Add a toggle to show all participants including those who left:
```tsx
<Select>
  <option value="active">Active Participants</option>
  <option value="all">All Participants (including left)</option>
</Select>
```

Query would change to:
```sql
WHERE arena_status IN ('active')  -- active only
-- OR
WHERE arena_status IN ('active', 'left')  -- all
```

### Auto-end on Session Delete
When a session is deleted, automatically set:
```sql
UPDATE arena_entries 
SET arena_status = 'ended', left_at = NOW()
WHERE session_id = :deletedSessionId
```

## Summary

**Key Principle**: Only `arena_status = 'active'` appears on leaderboard.

- ✅ **Active**: Currently competing (even if stopped/paused temporarily)
- ❌ **Left**: Voluntarily exited competition
- ❌ **Ended**: Session completed/deleted (future use)

This ensures fair, accurate leaderboards showing only participants who are still in the competition.
