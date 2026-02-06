-- Add starting_equity column to strategy_sessions
-- This allows each session to track its own starting equity (captured at session creation)
-- instead of relying on account-level starting_equity which is shared across all sessions

ALTER TABLE strategy_sessions ADD COLUMN IF NOT EXISTS starting_equity NUMERIC;

-- Add comment explaining the column
COMMENT ON COLUMN strategy_sessions.starting_equity IS 'Equity at session start time. For live sessions, this is the Hyperliquid account balance when the session was created. Used for calculating per-session returns.';
