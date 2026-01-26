-- Fix strategy_sessions mode constraint to allow live mode
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE strategy_sessions
  DROP CONSTRAINT IF EXISTS strategy_sessions_mode_check;

-- Add new constraint that allows both virtual and live
ALTER TABLE strategy_sessions
  ADD CONSTRAINT strategy_sessions_mode_check
  CHECK (mode IN ('virtual', 'live'));

-- Verify the change
SELECT 
  tc.table_name,
  cc.constraint_name,
  cc.check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
  AND cc.constraint_schema = tc.constraint_schema
WHERE cc.constraint_name = 'strategy_sessions_mode_check';
