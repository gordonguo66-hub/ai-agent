-- Fix Arena Session Not Appearing on Leaderboard
-- Run this entire script in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Add arena_status column if it doesn't exist
-- ============================================================================
ALTER TABLE arena_entries 
  ADD COLUMN IF NOT EXISTS arena_status VARCHAR(20) DEFAULT 'active' 
    CHECK (arena_status IN ('active', 'left', 'ended'));

ALTER TABLE arena_entries 
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- Update existing entries to have active status
UPDATE arena_entries 
SET arena_status = 'active' 
WHERE arena_status IS NULL;

-- ============================================================================
-- STEP 2: Check current state of arena session
-- ============================================================================
SELECT 
  'Current Arena Entry Status' as check_type,
  ae.id as arena_entry_id,
  ae.session_id,
  ae.active,
  ae.arena_status,
  ae.display_name,
  s.mode as session_mode,
  s.status as session_status
FROM strategy_sessions s
LEFT JOIN arena_entries ae ON s.id = ae.session_id
WHERE s.id = '016aedcf-db81-4994-842a-267ebf8b73d7';

-- ============================================================================
-- STEP 3: Create arena entry if it doesn't exist
-- ============================================================================
-- This will insert an arena entry if one doesn't exist for this session
DO $$
DECLARE
  v_session_id UUID := '016aedcf-db81-4994-842a-267ebf8b73d7';
  v_user_id UUID;
  v_username TEXT;
  v_entry_exists BOOLEAN;
BEGIN
  -- Get user_id and username from session
  SELECT s.user_id, p.username
  INTO v_user_id, v_username
  FROM strategy_sessions s
  LEFT JOIN profiles p ON s.user_id = p.id
  WHERE s.id = v_session_id;

  -- Check if entry exists
  SELECT EXISTS(
    SELECT 1 FROM arena_entries WHERE session_id = v_session_id
  ) INTO v_entry_exists;

  IF NOT v_entry_exists THEN
    -- Create arena entry
    INSERT INTO arena_entries (
      user_id,
      session_id,
      mode,
      display_name,
      active,
      arena_status,
      opted_in_at
    ) VALUES (
      v_user_id,
      v_session_id,
      'arena',
      COALESCE(v_username, 'Player'),
      true,
      'active',
      NOW()
    );
    RAISE NOTICE 'Created arena entry for session %', v_session_id;
  ELSE
    -- Update existing entry to be active
    UPDATE arena_entries
    SET active = true,
        arena_status = 'active'
    WHERE session_id = v_session_id;
    RAISE NOTICE 'Updated existing arena entry for session %', v_session_id;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Verify arena entry was created/updated
-- ============================================================================
SELECT 
  'After Fix - Arena Entry' as check_type,
  ae.id as arena_entry_id,
  ae.session_id,
  ae.active,
  ae.arena_status,
  ae.display_name,
  ae.opted_in_at
FROM arena_entries ae
WHERE ae.session_id = '016aedcf-db81-4994-842a-267ebf8b73d7';

-- ============================================================================
-- STEP 5: Check equity snapshots (needed for leaderboard)
-- ============================================================================
SELECT 
  'Equity Snapshots' as check_type,
  COUNT(*) as snapshot_count,
  MAX(t) as latest_snapshot,
  MAX(equity) as latest_equity
FROM equity_points
WHERE session_id = '016aedcf-db81-4994-842a-267ebf8b73d7';

-- ============================================================================
-- STEP 6: Manually create arena snapshot if needed
-- ============================================================================
-- This ensures the session appears on leaderboard immediately
DO $$
DECLARE
  v_session_id UUID := '016aedcf-db81-4994-842a-267ebf8b73d7';
  v_arena_entry_id UUID;
  v_equity NUMERIC;
  v_snapshot_exists BOOLEAN;
BEGIN
  -- Get arena entry ID
  SELECT id INTO v_arena_entry_id
  FROM arena_entries
  WHERE session_id = v_session_id;

  -- Get current equity from virtual_accounts
  SELECT va.equity INTO v_equity
  FROM strategy_sessions s
  JOIN virtual_accounts va ON s.account_id = va.id
  WHERE s.id = v_session_id;

  -- Check if snapshot exists
  SELECT EXISTS(
    SELECT 1 FROM arena_snapshots WHERE arena_entry_id = v_arena_entry_id
  ) INTO v_snapshot_exists;

  IF v_arena_entry_id IS NOT NULL AND v_equity IS NOT NULL THEN
    IF NOT v_snapshot_exists THEN
      -- Create initial snapshot
      INSERT INTO arena_snapshots (
        arena_entry_id,
        equity,
        trades_count,
        win_rate,
        max_drawdown_pct,
        captured_at
      ) VALUES (
        v_arena_entry_id,
        v_equity,
        0,
        0.0,
        0.0,
        NOW()
      );
      RAISE NOTICE 'Created arena snapshot for entry %', v_arena_entry_id;
    ELSE
      -- Update existing snapshot
      UPDATE arena_snapshots
      SET equity = v_equity,
          captured_at = NOW()
      WHERE arena_entry_id = v_arena_entry_id
        AND captured_at = (
          SELECT MAX(captured_at) 
          FROM arena_snapshots 
          WHERE arena_entry_id = v_arena_entry_id
        );
      RAISE NOTICE 'Updated arena snapshot for entry %', v_arena_entry_id;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- STEP 7: Final verification - should appear on leaderboard now
-- ============================================================================
SELECT 
  'Final Status - Should Appear on Leaderboard' as check_type,
  ae.display_name,
  ae.active,
  ae.arena_status,
  asn.equity as latest_equity,
  asn.captured_at as snapshot_time,
  s.status as session_status
FROM arena_entries ae
LEFT JOIN arena_snapshots asn ON ae.id = asn.arena_entry_id
LEFT JOIN strategy_sessions s ON ae.session_id = s.id
WHERE ae.session_id = '016aedcf-db81-4994-842a-267ebf8b73d7'
  AND ae.active = true
  AND ae.arena_status = 'active'
ORDER BY asn.captured_at DESC
LIMIT 1;

-- ============================================================================
-- DONE! 
-- ============================================================================
-- If the final query returns a row, your session will appear on the leaderboard.
-- Refresh the /arena page after running this script.
