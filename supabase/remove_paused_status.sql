-- Remove "paused" status from strategy_sessions
-- Date: 2026-01-24
-- Purpose: Simplify session controls - only "running" and "stopped" states

-- Drop the existing status constraint
ALTER TABLE strategy_sessions
  DROP CONSTRAINT IF EXISTS strategy_sessions_status_check;

-- Add new constraint that only allows running and stopped (no paused)
ALTER TABLE strategy_sessions
  ADD CONSTRAINT strategy_sessions_status_check
  CHECK (status IN ('running', 'stopped'));

-- Update any existing sessions that are paused to stopped
UPDATE strategy_sessions
SET status = 'stopped'
WHERE status = 'paused';

-- Verify the change
SELECT 
  cc.check_clause as constraint_definition
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
  AND cc.constraint_schema = tc.constraint_schema
WHERE cc.constraint_name = 'strategy_sessions_status_check';

-- Note: Stop behavior now halts AI decisions immediately without closing positions
-- Sessions can be resumed by clicking Start again (same session, no reset)
