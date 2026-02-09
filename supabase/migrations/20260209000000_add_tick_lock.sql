-- Add last_tick_at column for tick deduplication
ALTER TABLE strategy_sessions
ADD COLUMN IF NOT EXISTS last_tick_at TIMESTAMPTZ;

-- Create atomic tick lock function
CREATE OR REPLACE FUNCTION acquire_tick_lock(
  p_session_id UUID,
  p_min_interval_ms INTEGER DEFAULT 10000
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE strategy_sessions
  SET last_tick_at = NOW()
  WHERE id = p_session_id
    AND (
      last_tick_at IS NULL
      OR last_tick_at < NOW() - (p_min_interval_ms || ' milliseconds')::INTERVAL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- Auto-refresh PostgREST schema cache after this migration
NOTIFY pgrst, 'reload schema';
