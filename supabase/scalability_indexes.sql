-- Database Indexes for Scalability
-- Run this in Supabase SQL Editor to optimize queries for thousands/millions of users

-- Strategy Sessions Indexes (most critical for cron job)
CREATE INDEX IF NOT EXISTS idx_strategy_sessions_status_running 
  ON strategy_sessions(status) 
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_strategy_sessions_status_last_tick 
  ON strategy_sessions(status, last_tick_at) 
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_strategy_sessions_user_id_status 
  ON strategy_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_strategy_sessions_created_at 
  ON strategy_sessions(created_at DESC);

-- Arena Indexes (for leaderboard performance)
CREATE INDEX IF NOT EXISTS idx_arena_entries_mode_active 
  ON arena_entries(mode, active) 
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_arena_entries_session_id 
  ON arena_entries(session_id);

CREATE INDEX IF NOT EXISTS idx_arena_snapshots_entry_id_captured 
  ON arena_snapshots(arena_entry_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_arena_snapshots_captured_at 
  ON arena_snapshots(captured_at DESC);

-- Virtual Trades Indexes (for trade history queries)
CREATE INDEX IF NOT EXISTS idx_virtual_trades_account_id_created 
  ON virtual_trades(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_virtual_trades_session_id_created 
  ON virtual_trades(session_id, created_at DESC) 
  WHERE session_id IS NOT NULL;

-- Virtual Positions Indexes
CREATE INDEX IF NOT EXISTS idx_virtual_positions_account_id_market 
  ON virtual_positions(account_id, market);

-- Session Decisions Indexes
CREATE INDEX IF NOT EXISTS idx_session_decisions_session_id_created 
  ON session_decisions(session_id, created_at DESC);

-- Exchange Connections Indexes
CREATE INDEX IF NOT EXISTS idx_exchange_connections_user_id_created 
  ON exchange_connections(user_id, created_at DESC);

-- Strategies Indexes
CREATE INDEX IF NOT EXISTS idx_strategies_user_id_created 
  ON strategies(user_id, created_at DESC);

-- Equity Points Indexes (for equity curve queries)
CREATE INDEX IF NOT EXISTS idx_equity_points_account_id_t 
  ON equity_points(account_id, t DESC);

CREATE INDEX IF NOT EXISTS idx_equity_points_session_id_t 
  ON equity_points(session_id, t DESC) 
  WHERE session_id IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sessions_user_status_created 
  ON strategy_sessions(user_id, status, created_at DESC);

-- Analyze tables to update statistics (helps query planner)
ANALYZE strategy_sessions;
ANALYZE arena_entries;
ANALYZE arena_snapshots;
ANALYZE virtual_trades;
ANALYZE virtual_positions;
ANALYZE session_decisions;
