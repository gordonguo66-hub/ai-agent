-- Migration: Add lifetime token tracking to user_balance
-- Eliminates the need to scan all balance_transactions for token aggregation,
-- which was previously capped at 50,000 rows and would undercount for heavy users.
-- Now tokens are tracked atomically in the decrement functions (same as lifetime_spent_cents).

-- ============================================
-- 1. Add lifetime_tokens_used to user_balance
-- ============================================

ALTER TABLE user_balance
  ADD COLUMN IF NOT EXISTS lifetime_tokens_used BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_balance.lifetime_tokens_used
  IS 'Running total of all tokens consumed across all AI calls. Updated atomically by decrement functions.';

-- ============================================
-- 2. Backfill from existing balance_transactions
-- ============================================

UPDATE user_balance ub
SET lifetime_tokens_used = COALESCE(sub.total_tokens, 0)
FROM (
  SELECT
    user_id,
    SUM(
      COALESCE(
        (metadata->>'total_tokens')::BIGINT,
        COALESCE((metadata->>'input_tokens')::BIGINT, 0)
          + COALESCE((metadata->>'output_tokens')::BIGINT, 0)
      )
    ) AS total_tokens
  FROM balance_transactions
  WHERE transaction_type IN ('usage', 'subscription_usage')
  GROUP BY user_id
) sub
WHERE ub.user_id = sub.user_id;

-- ============================================
-- 3. Update decrement_user_balance to track tokens
-- ============================================

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
  v_tokens BIGINT;
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

  -- Extract token count from metadata
  v_tokens := COALESCE(
    (p_metadata->>'total_tokens')::BIGINT,
    COALESCE((p_metadata->>'input_tokens')::BIGINT, 0)
      + COALESCE((p_metadata->>'output_tokens')::BIGINT, 0)
  );

  -- Deduct balance atomically
  v_new_balance := v_current_balance - p_amount_cents;

  UPDATE user_balance
  SET balance_cents = v_new_balance,
      lifetime_spent_cents = v_lifetime_spent + p_amount_cents,
      lifetime_tokens_used = lifetime_tokens_used + v_tokens,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Record the transaction for audit trail
  INSERT INTO balance_transactions (
    user_id, amount, balance_after, transaction_type, description, metadata
  ) VALUES (
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

-- Keep existing permissions
GRANT EXECUTE ON FUNCTION decrement_user_balance TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_user_balance TO service_role;

-- ============================================
-- 4. Update decrement_user_balance_v2 to track tokens
-- ============================================

CREATE OR REPLACE FUNCTION decrement_user_balance_v2(
  p_user_id UUID,
  p_base_cost_cents INTEGER,
  p_ondemand_markup NUMERIC,
  p_subscription_markup NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
  v_sub_budget INTEGER;
  v_lifetime_spent INTEGER;
  v_ondemand_charge INTEGER;
  v_subscription_charge INTEGER;
  v_new_balance INTEGER;
  v_new_sub_budget INTEGER;
  v_tokens BIGINT;
BEGIN
  -- Validate input
  IF p_base_cost_cents <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_amount',
      'message', 'Base cost must be positive'
    );
  END IF;

  -- Extract token count from metadata
  v_tokens := COALESCE(
    (p_metadata->>'total_tokens')::BIGINT,
    COALESCE((p_metadata->>'input_tokens')::BIGINT, 0)
      + COALESCE((p_metadata->>'output_tokens')::BIGINT, 0)
  );

  -- Lock the row and get current balances atomically
  SELECT balance_cents, subscription_budget_cents, COALESCE(lifetime_spent_cents, 0)
  INTO v_balance, v_sub_budget, v_lifetime_spent
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

  -- Calculate charges for each pool
  v_ondemand_charge := ROUND(p_base_cost_cents * (1 + p_ondemand_markup));
  v_subscription_charge := ROUND(p_base_cost_cents * (1 + p_subscription_markup));

  -- Priority 1: Try top-up balance at on-demand rate
  IF v_balance >= v_ondemand_charge THEN
    v_new_balance := v_balance - v_ondemand_charge;

    UPDATE user_balance
    SET balance_cents = v_new_balance,
        lifetime_spent_cents = v_lifetime_spent + v_ondemand_charge,
        lifetime_tokens_used = lifetime_tokens_used + v_tokens,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO balance_transactions (
      user_id, amount, balance_after, transaction_type, description, metadata
    ) VALUES (
      p_user_id,
      -v_ondemand_charge,
      v_new_balance,
      'usage',
      COALESCE(p_description, 'AI model usage'),
      p_metadata || jsonb_build_object(
        'source', 'topup',
        'base_cost_cents', p_base_cost_cents,
        'charged_cents', v_ondemand_charge,
        'markup_applied', p_ondemand_markup
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'source', 'topup',
      'amount_deducted_cents', v_ondemand_charge,
      'new_balance_cents', v_new_balance,
      'new_subscription_budget_cents', v_sub_budget
    );
  END IF;

  -- Priority 2: Try subscription budget at subscription rate
  IF v_sub_budget >= v_subscription_charge THEN
    v_new_sub_budget := v_sub_budget - v_subscription_charge;

    UPDATE user_balance
    SET subscription_budget_cents = v_new_sub_budget,
        lifetime_spent_cents = v_lifetime_spent + v_subscription_charge,
        lifetime_tokens_used = lifetime_tokens_used + v_tokens,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO balance_transactions (
      user_id, amount, balance_after, transaction_type, description, metadata
    ) VALUES (
      p_user_id,
      -v_subscription_charge,
      v_new_sub_budget,
      'subscription_usage',
      COALESCE(p_description, 'AI model usage (subscription)'),
      p_metadata || jsonb_build_object(
        'source', 'subscription',
        'base_cost_cents', p_base_cost_cents,
        'charged_cents', v_subscription_charge,
        'markup_applied', p_subscription_markup
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'source', 'subscription',
      'amount_deducted_cents', v_subscription_charge,
      'new_balance_cents', v_balance,
      'new_subscription_budget_cents', v_new_sub_budget
    );
  END IF;

  -- Both pools insufficient
  RETURN jsonb_build_object(
    'success', false,
    'error', 'insufficient_balance',
    'message', 'Insufficient balance and subscription budget',
    'current_balance_cents', v_balance,
    'current_subscription_budget_cents', v_sub_budget,
    'required_ondemand_cents', v_ondemand_charge,
    'required_subscription_cents', v_subscription_charge
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Keep existing permissions
REVOKE EXECUTE ON FUNCTION decrement_user_balance_v2 FROM public;
REVOKE EXECUTE ON FUNCTION decrement_user_balance_v2 FROM authenticated;
GRANT EXECUTE ON FUNCTION decrement_user_balance_v2 TO service_role;
