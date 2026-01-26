-- Arena Session Diagnostic Script
-- Run this in Supabase SQL Editor to diagnose why arena sessions aren't ticking

-- =============================================================================
-- 1. CHECK: Do arena sessions exist?
-- =============================================================================
SELECT 
  'Arena Sessions' as check_name,
  COUNT(*) as count
FROM strategy_sessions
WHERE mode = 'arena';

-- Expected: > 0 if you've created arena sessions

-- =============================================================================
-- 2. CHECK: Are arena sessions running?
-- =============================================================================
SELECT 
  id,
  mode,
  status,
  started_at,
  last_tick_at,
  cadence_seconds,
  markets,
  account_id,
  created_at
FROM strategy_sessions
WHERE mode = 'arena'
ORDER BY created_at DESC
LIMIT 10;

-- Expected:
-- - mode = 'arena'
-- - status = 'running' (if started, should be 'stopped' if not started yet)
-- - started_at = <timestamp> (if started)
-- - account_id = <uuid> (not null)
-- - markets = [array of markets]

-- =============================================================================
-- 3. CHECK: Do arena sessions have virtual accounts?
-- =============================================================================
SELECT 
  s.id as session_id,
  s.mode,
  s.status,
  s.account_id,
  va.id as virtual_account_id,
  va.equity,
  va.starting_equity,
  va.cash_balance
FROM strategy_sessions s
LEFT JOIN virtual_accounts va ON s.account_id = va.id
WHERE s.mode = 'arena'
ORDER BY s.created_at DESC
LIMIT 10;

-- Expected:
-- - virtual_account_id should NOT be null
-- - starting_equity should be 100000
-- - equity should be 100000 (initially)

-- =============================================================================
-- 4. CHECK: Running arena sessions count
-- =============================================================================
SELECT 
  mode,
  status,
  COUNT(*) as session_count
FROM strategy_sessions
WHERE mode IN ('virtual', 'arena', 'live')
GROUP BY mode, status
ORDER BY mode, status;

-- Expected:
-- If you have arena sessions set to running, you should see:
-- mode='arena', status='running', count > 0

-- =============================================================================
-- 5. CHECK: Are equity snapshots being written for arena sessions?
-- =============================================================================
SELECT 
  s.id as session_id,
  s.mode,
  s.status,
  COUNT(ep.id) as snapshot_count,
  MAX(ep.t) as latest_snapshot,
  ROUND(MAX(ep.equity)::numeric, 2) as latest_equity,
  ROUND(MIN(ep.equity)::numeric, 2) as earliest_equity
FROM strategy_sessions s
LEFT JOIN equity_points ep ON s.id = ep.session_id
WHERE s.mode = 'arena'
GROUP BY s.id, s.mode, s.status
ORDER BY MAX(ep.t) DESC NULLS LAST
LIMIT 10;

-- Expected:
-- - snapshot_count > 0 (if session has been ticking)
-- - latest_snapshot should be recent (within last few minutes if running)
-- - If snapshot_count = 0, session is NOT ticking

-- =============================================================================
-- 6. CHECK: Are decisions being created for arena sessions?
-- =============================================================================
SELECT 
  s.id as session_id,
  s.mode,
  s.status,
  COUNT(d.id) as decision_count,
  MAX(d.created_at) as latest_decision,
  array_agg(DISTINCT d.market) as markets_with_decisions
FROM strategy_sessions s
LEFT JOIN decisions d ON s.id = d.session_id
WHERE s.mode = 'arena'
GROUP BY s.id, s.mode, s.status
ORDER BY MAX(d.created_at) DESC NULLS LAST
LIMIT 10;

-- Expected:
-- - decision_count > 0 (if AI has made decisions)
-- - latest_decision should be recent
-- - If decision_count = 0, either:
--   a) Session hasn't ticked yet
--   b) Tick is happening but AI isn't being called
--   c) AI is being called but rejecting all entries

-- =============================================================================
-- 7. CHECK: Are arena entries being created?
-- =============================================================================
SELECT 
  ae.id as arena_entry_id,
  ae.session_id,
  ae.display_name,
  ae.active,
  ae.arena_status,
  ae.opted_in_at,
  ae.left_at,
  s.mode,
  s.status
FROM arena_entries ae
LEFT JOIN strategy_sessions s ON ae.session_id = s.id
WHERE s.mode = 'arena'
ORDER BY ae.opted_in_at DESC
LIMIT 10;

-- Expected:
-- - arena_entry_id should exist for each arena session
-- - active = true
-- - arena_status = 'active'
-- - If arena_status = 'left', session won't appear on leaderboard (but should still tick)

-- =============================================================================
-- 8. CHECK: Are arena snapshots being written?
-- =============================================================================
SELECT 
  s.id as session_id,
  ae.id as arena_entry_id,
  COUNT(asn.id) as arena_snapshot_count,
  MAX(asn.captured_at) as latest_arena_snapshot,
  ROUND(MAX(asn.equity)::numeric, 2) as latest_equity
FROM strategy_sessions s
LEFT JOIN arena_entries ae ON s.id = ae.session_id
LEFT JOIN arena_snapshots asn ON ae.id = asn.arena_entry_id
WHERE s.mode = 'arena'
GROUP BY s.id, ae.id
ORDER BY MAX(asn.captured_at) DESC NULLS LAST
LIMIT 10;

-- Expected:
-- - arena_snapshot_count > 0 (if session has been ticking)
-- - latest_arena_snapshot should be recent
-- - If arena_snapshot_count = 0, arena snapshots aren't being updated

-- =============================================================================
-- 9. CHECK: Database constraints (mode and status)
-- =============================================================================
SELECT 
  tc.constraint_name,
  cc.check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc 
  ON cc.constraint_name = tc.constraint_name
  AND cc.constraint_schema = tc.constraint_schema
WHERE tc.table_name = 'strategy_sessions'
  AND tc.constraint_type = 'CHECK'
  AND (cc.constraint_name LIKE '%mode%' OR cc.constraint_name LIKE '%status%')
ORDER BY tc.constraint_name;

-- Expected:
-- - strategy_sessions_mode_check: ((mode)::text = ANY ((ARRAY['virtual'::character varying, 'live'::character varying, 'arena'::character varying])::text[]))
-- - strategy_sessions_status_check: ((status)::text = ANY ((ARRAY['running'::character varying, 'stopped'::character varying])::text[]))

-- =============================================================================
-- 10. CHECK: Compare arena vs virtual session behavior
-- =============================================================================
SELECT 
  s.mode,
  s.status,
  COUNT(DISTINCT s.id) as session_count,
  COUNT(DISTINCT ep.id) as total_snapshots,
  COUNT(DISTINCT d.id) as total_decisions,
  MAX(ep.t) as latest_snapshot,
  MAX(d.created_at) as latest_decision
FROM strategy_sessions s
LEFT JOIN equity_points ep ON s.id = ep.session_id
LEFT JOIN decisions d ON s.id = d.session_id
WHERE s.mode IN ('virtual', 'arena')
  AND s.status = 'running'
GROUP BY s.mode, s.status
ORDER BY s.mode;

-- Expected:
-- Both 'virtual' and 'arena' running sessions should have:
-- - total_snapshots > 0
-- - total_decisions > 0 (if AI has made decisions)
-- - recent latest_snapshot and latest_decision timestamps
-- If arena has 0 snapshots but virtual has many, arena ticking is broken

-- =============================================================================
-- DIAGNOSIS SUMMARY
-- =============================================================================
-- Use the results above to diagnose the issue:
--
-- IF arena sessions don't exist (check 1):
--   → User hasn't created any arena sessions yet
--   → Try clicking "Start in Arena" on a strategy
--
-- IF arena sessions exist but status='stopped' (check 2):
--   → Sessions were created but never started
--   → Frontend might be failing to call control endpoint
--   → Check browser network tab for PATCH /api/sessions/:id/control
--
-- IF arena sessions have no virtual_accounts (check 3):
--   → Account creation failed during session creation
--   → Check logs for errors in POST /api/sessions
--
-- IF arena sessions are running but have 0 snapshots (check 5):
--   → Sessions are not being ticked by cron
--   → Check cron job is running: grep "\[Cron\]" logs
--   → Check tick endpoint logs: grep "ENGINE START" logs
--
-- IF arena sessions have snapshots but no decisions (check 6):
--   → Ticks are happening but AI is not making decisions
--   → AI might be rejecting all entry conditions
--   → Check AI confidence levels in strategy settings
--
-- IF arena sessions have snapshots but no arena_entries (check 7):
--   → Arena entry creation failed
--   → Check logs for errors in POST /api/sessions (arena entry insert)
--
-- IF arena sessions have snapshots but no arena_snapshots (check 8):
--   → Regular equity tracking works but arena-specific tracking doesn't
--   → Check updateArenaSnapshot function for errors
--
-- IF constraints don't include 'arena' (check 9):
--   → Run migration: supabase/add_arena_mode.sql
--   → This will add 'arena' to the mode constraint
--
-- IF virtual sessions work but arena doesn't (check 10):
--   → There's a mode-specific filter or rejection in the tick pipeline
--   → This should NOT happen after our fix
--   → Check logs for "ENGINE START" with mode=arena
