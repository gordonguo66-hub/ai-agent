-- Migration: Add Stripe webhook idempotency tracking and atomic balance updates
-- This prevents duplicate webhook processing and race conditions in balance updates

-- Table to track processed Stripe events (for idempotency)
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

-- Index for querying by event type (useful for debugging/auditing)
CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_type
  ON processed_stripe_events(event_type);

-- Index for cleanup of old events
CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_processed_at
  ON processed_stripe_events(processed_at);

-- Atomic balance increment function
-- This function handles idempotency checking and atomic balance updates in a single transaction
CREATE OR REPLACE FUNCTION increment_user_balance(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_event_id TEXT,
  p_event_type TEXT DEFAULT 'checkout.session.completed',
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_event_exists BOOLEAN;
BEGIN
  -- Check if event was already processed (idempotency check)
  SELECT EXISTS(
    SELECT 1 FROM processed_stripe_events WHERE event_id = p_event_id
  ) INTO v_event_exists;

  IF v_event_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'duplicate_event',
      'message', 'Event already processed'
    );
  END IF;

  -- Insert idempotency record first (will fail on duplicate, rolling back the transaction)
  INSERT INTO processed_stripe_events (event_id, event_type, metadata)
  VALUES (p_event_id, p_event_type, p_metadata);

  -- Atomic upsert with increment for user_balance table
  INSERT INTO user_balance (user_id, balance_cents)
  VALUES (p_user_id, p_amount_cents)
  ON CONFLICT (user_id) DO UPDATE
  SET balance_cents = user_balance.balance_cents + EXCLUDED.balance_cents,
      updated_at = NOW()
  RETURNING balance_cents INTO v_new_balance;

  -- Record the transaction for audit trail
  INSERT INTO balance_transactions (
    user_id,
    amount,
    balance_after,
    transaction_type,
    description,
    metadata
  )
  VALUES (
    p_user_id,
    p_amount_cents,
    v_new_balance,
    'topup',
    COALESCE(p_description, 'Added $' || (p_amount_cents / 100.0)::TEXT || ' to balance'),
    p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'amount_added', p_amount_cents
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Duplicate event_id insertion (race condition caught)
    RETURN jsonb_build_object(
      'success', false,
      'error', 'duplicate_event',
      'message', 'Event already processed (race condition)'
    );
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users (service role will use this)
GRANT EXECUTE ON FUNCTION increment_user_balance TO authenticated;
GRANT EXECUTE ON FUNCTION increment_user_balance TO service_role;

-- Cleanup function to remove old processed events (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_stripe_events(
  p_days_to_keep INTEGER DEFAULT 90
) RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM processed_stripe_events
  WHERE processed_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE processed_stripe_events IS 'Tracks processed Stripe webhook events for idempotency';
COMMENT ON FUNCTION increment_user_balance IS 'Atomically increments user balance with idempotency checking';
