-- Migration: Add atomic balance decrement function for credit usage
-- This prevents race conditions where concurrent AI calls could drive balance negative

-- Atomic balance decrement function
-- Checks balance and deducts in a single transaction to prevent TOCTOU race conditions
CREATE OR REPLACE FUNCTION decrement_user_balance(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_lifetime_spent INTEGER;
BEGIN
  -- Validate input
  IF p_amount_cents <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_amount',
      'message', 'Amount must be positive'
    );
  END IF;

  -- Lock the row and get current balance atomically
  SELECT balance_cents, COALESCE(lifetime_spent_cents, 0)
  INTO v_current_balance, v_lifetime_spent
  FROM user_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if user has a balance record
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_balance',
      'message', 'No balance record found for user'
    );
  END IF;

  -- Check sufficient balance
  IF v_current_balance < p_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'message', 'Insufficient balance',
      'current_balance_cents', v_current_balance,
      'required_cents', p_amount_cents
    );
  END IF;

  -- Deduct balance atomically
  v_new_balance := v_current_balance - p_amount_cents;

  UPDATE user_balance
  SET balance_cents = v_new_balance,
      lifetime_spent_cents = v_lifetime_spent + p_amount_cents,
      updated_at = NOW()
  WHERE user_id = p_user_id;

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
    -p_amount_cents,
    v_new_balance,
    'usage',
    COALESCE(p_description, 'AI model usage'),
    p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_balance_cents', v_new_balance,
    'amount_deducted_cents', p_amount_cents
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION decrement_user_balance TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_user_balance TO service_role;

COMMENT ON FUNCTION decrement_user_balance IS 'Atomically decrements user balance with sufficient-balance check to prevent race conditions';
