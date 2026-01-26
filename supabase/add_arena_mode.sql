-- Add "arena" as a valid mode for strategy_sessions and arena_entries
-- Date: 2026-01-24
-- Purpose: Support Arena mode as a session creation option with standardized $100k starting equity

-- 1. Update strategy_sessions mode constraint
ALTER TABLE strategy_sessions
  DROP CONSTRAINT IF EXISTS strategy_sessions_mode_check;

ALTER TABLE strategy_sessions
  ADD CONSTRAINT strategy_sessions_mode_check
  CHECK (mode IN ('virtual', 'live', 'arena'));

-- 2. Update arena_entries mode constraint
ALTER TABLE arena_entries
  DROP CONSTRAINT IF EXISTS arena_entries_mode_check;

ALTER TABLE arena_entries
  ADD CONSTRAINT arena_entries_mode_check
  CHECK (mode IN ('virtual', 'live', 'arena'));

-- 3. Verify the changes
SELECT 
  'strategy_sessions' as table_name,
  cc.check_clause as constraint_definition
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
  AND cc.constraint_schema = tc.constraint_schema
WHERE cc.constraint_name = 'strategy_sessions_mode_check'

UNION ALL

SELECT 
  'arena_entries' as table_name,
  cc.check_clause as constraint_definition
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
  AND cc.constraint_schema = tc.constraint_schema
WHERE cc.constraint_name = 'arena_entries_mode_check';

-- Note: Arena mode uses virtual_accounts (same as virtual mode) with standardized starting_equity=100000
-- Arena sessions automatically create arena_entries records for leaderboard tracking
