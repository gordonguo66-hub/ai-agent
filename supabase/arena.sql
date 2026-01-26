-- Arena System Tables
-- Tracks user participation in competitive trading arenas
-- NOTE: This replaces the old arena_entries table from schema.sql that referenced paper_runs

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop old arena_entries table if it exists (from schema.sql - references paper_runs)
-- This is safe because we're replacing it with a new structure
DROP TABLE IF EXISTS arena_entries CASCADE;

-- arena_entries: Tracks which sessions are participating in the arena
-- Requires strategy_sessions table to exist (from virtual_trading.sql)
CREATE TABLE arena_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES strategy_sessions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('virtual', 'live')),
  display_name TEXT NOT NULL,
  opted_in_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(session_id) -- One session can only be in arena once
);

-- arena_snapshots: Periodically updated performance metrics for ranking
CREATE TABLE IF NOT EXISTS arena_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_entry_id UUID NOT NULL REFERENCES arena_entries(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Virtual arena metrics
  equity NUMERIC,
  
  -- Live arena metrics
  total_pnl NUMERIC,
  return_pct NUMERIC,
  
  -- Shared metrics
  trades_count INT NOT NULL DEFAULT 0,
  win_rate NUMERIC,
  max_drawdown_pct NUMERIC
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_arena_entries_user_id ON arena_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_entries_session_id ON arena_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_arena_entries_mode_active ON arena_entries(mode, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_arena_snapshots_entry_id ON arena_snapshots(arena_entry_id);
CREATE INDEX IF NOT EXISTS idx_arena_snapshots_captured_at ON arena_snapshots(captured_at DESC);

-- RLS Policies

-- Enable RLS
ALTER TABLE arena_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_snapshots ENABLE ROW LEVEL SECURITY;

-- arena_entries policies
-- Users can read all arena entries (for leaderboard)
DROP POLICY IF EXISTS "arena_entries_select_all" ON arena_entries;
CREATE POLICY "arena_entries_select_all" ON arena_entries
  FOR SELECT
  USING (true);

-- Users can only insert/update/delete their own entries
DROP POLICY IF EXISTS "arena_entries_insert_own" ON arena_entries;
CREATE POLICY "arena_entries_insert_own" ON arena_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "arena_entries_update_own" ON arena_entries;
CREATE POLICY "arena_entries_update_own" ON arena_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "arena_entries_delete_own" ON arena_entries;
CREATE POLICY "arena_entries_delete_own" ON arena_entries
  FOR DELETE
  USING (auth.uid() = user_id);

-- arena_snapshots policies
-- Users can read all snapshots (for leaderboard)
DROP POLICY IF EXISTS "arena_snapshots_select_all" ON arena_snapshots;
CREATE POLICY "arena_snapshots_select_all" ON arena_snapshots
  FOR SELECT
  USING (true);

-- Insert/update only via service role (server-side)
-- No direct user insert/update policies (handled by service role client)
