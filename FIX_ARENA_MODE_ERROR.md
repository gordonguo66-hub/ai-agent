# Fix Arena Mode Database Error

**Error**: `new row for relation "strategy_sessions" violates check constraint "strategy_sessions_mode_check"`

**Cause**: The database constraint only allows `'virtual'` and `'live'` modes, but not `'arena'`.

---

## Quick Fix (Run this SQL in Supabase)

1. Open your Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

2. Copy and paste the contents of `supabase/add_arena_mode.sql` and click **Run**

Or run this directly:

```sql
-- Update strategy_sessions mode constraint
ALTER TABLE strategy_sessions
  DROP CONSTRAINT IF EXISTS strategy_sessions_mode_check;

ALTER TABLE strategy_sessions
  ADD CONSTRAINT strategy_sessions_mode_check
  CHECK (mode IN ('virtual', 'live', 'arena'));

-- Update arena_entries mode constraint
ALTER TABLE arena_entries
  DROP CONSTRAINT IF EXISTS arena_entries_mode_check;

ALTER TABLE arena_entries
  ADD CONSTRAINT arena_entries_mode_check
  CHECK (mode IN ('virtual', 'live', 'arena'));
```

3. Verify it worked:

```sql
SELECT 
  'strategy_sessions' as table_name,
  cc.check_clause as constraint_definition
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
WHERE cc.constraint_name = 'strategy_sessions_mode_check'

UNION ALL

SELECT 
  'arena_entries' as table_name,
  cc.check_clause as constraint_definition
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
WHERE cc.constraint_name = 'arena_entries_mode_check';
```

You should see both constraints now include `'arena'`.

---

## After Running Migration

1. Refresh your browser (the "Start in Arena" button should now work)
2. Click **"Start in Arena 🏆"**
3. Session will be created with:
   - `mode = "arena"`
   - Fresh virtual account with $100k starting equity
   - Automatic arena entry on leaderboard

---

## What This Fixed

✅ **strategy_sessions table**: Now allows `mode IN ('virtual', 'live', 'arena')`  
✅ **arena_entries table**: Now allows `mode IN ('virtual', 'live', 'arena')`

The code was already updated, but the database schema was missing the new mode value.

---

**Status**: Ready to use Arena mode after running this migration! 🏆
