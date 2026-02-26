-- Add last_guard_at column for price guard deduplication
-- The price guard checks TP/SL thresholds every minute (between AI ticks)
-- This lock prevents overlapping guard invocations for the same session
ALTER TABLE strategy_sessions
ADD COLUMN IF NOT EXISTS last_guard_at TIMESTAMPTZ;

-- Create atomic guard lock function (mirrors acquire_tick_lock pattern)
CREATE OR REPLACE FUNCTION acquire_guard_lock(
  p_session_id UUID,
  p_min_interval_ms INTEGER DEFAULT 50000
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE strategy_sessions
  SET last_guard_at = NOW()
  WHERE id = p_session_id
    AND (
      last_guard_at IS NULL
      OR last_guard_at < NOW() - (p_min_interval_ms || ' milliseconds')::INTERVAL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- Only service_role should be able to acquire guard locks
REVOKE EXECUTE ON FUNCTION acquire_guard_lock FROM public;
REVOKE EXECUTE ON FUNCTION acquire_guard_lock FROM authenticated;
GRANT EXECUTE ON FUNCTION acquire_guard_lock TO service_role;

NOTIFY pgrst, 'reload schema';
