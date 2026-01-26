-- Arena Status Tracking Migration
-- Adds proper eligibility tracking for arena participants

-- Add arena_status and left_at to arena_entries
ALTER TABLE arena_entries 
  ADD COLUMN IF NOT EXISTS arena_status VARCHAR(20) DEFAULT 'active' 
    CHECK (arena_status IN ('active', 'left', 'ended'));

ALTER TABLE arena_entries 
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Update existing entries to have active status
UPDATE arena_entries 
SET arena_status = 'active' 
WHERE arena_status IS NULL;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_arena_entries_status 
  ON arena_entries(arena_status, active);

-- Add index for time-based queries
CREATE INDEX IF NOT EXISTS idx_arena_entries_left_at 
  ON arena_entries(left_at);

COMMENT ON COLUMN arena_entries.arena_status IS 
  'Status of arena participation: active (currently competing), left (manually left arena), ended (session stopped/completed)';

COMMENT ON COLUMN arena_entries.left_at IS 
  'Timestamp when user left arena or session ended';
