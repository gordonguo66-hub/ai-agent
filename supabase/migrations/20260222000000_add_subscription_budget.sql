-- Migration: Add separate subscription budget pool
-- Subscriptions now provide a monthly spending budget (e.g. $29 for Pro)
-- that is consumed at the plan's markup rate (1.6× for Pro vs 2× on-demand).
-- Top-up balance is consumed first at on-demand rate, then subscription budget.

-- ============================================
-- 1. Add subscription budget columns to user_balance
-- ============================================

ALTER TABLE user_balance
  ADD COLUMN IF NOT EXISTS subscription_budget_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_balance
  ADD COLUMN IF NOT EXISTS subscription_budget_granted_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_balance.subscription_budget_cents
  IS 'Remaining subscription budget in cents. Resets each billing cycle. 0 for non-subscribers.';

COMMENT ON COLUMN user_balance.subscription_budget_granted_cents
  IS 'Total budget granted for the current billing period. Used for UI display (X of Y remaining).';

-- ============================================
-- 2. Add budget_cents to subscription_plans
-- ============================================

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS budget_cents INTEGER NOT NULL DEFAULT 0;

-- Budget equals subscription price: simple mental model
UPDATE subscription_plans SET budget_cents = 2900  WHERE id = 'pro';
UPDATE subscription_plans SET budget_cents = 8900  WHERE id = 'pro_plus';
UPDATE subscription_plans SET budget_cents = 24900 WHERE id = 'ultra';

COMMENT ON COLUMN subscription_plans.budget_cents
  IS 'Monthly budget granted to subscribers in cents. Equals the plan price.';

-- ============================================
-- 3. Update transaction_type CHECK constraint
-- ============================================

-- Drop the old constraint and re-create with new types
ALTER TABLE balance_transactions
  DROP CONSTRAINT IF EXISTS balance_transactions_transaction_type_check;

ALTER TABLE balance_transactions
  ADD CONSTRAINT balance_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'subscription_grant', 'usage', 'purchase', 'refund',
    'adjustment', 'signup_bonus', 'topup',
    'subscription_usage', 'subscription_budget_grant'
  ));

-- ============================================
-- 4. Create dual-pool decrement RPC
-- ============================================

-- New function with different name to avoid breaking existing code during deploy.
-- The tick route will be updated to call this instead of decrement_user_balance.
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
BEGIN
  -- Validate input
  IF p_base_cost_cents <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_amount',
      'message', 'Base cost must be positive'
    );
  END IF;

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

-- Security: service_role only
REVOKE EXECUTE ON FUNCTION decrement_user_balance_v2 FROM public;
REVOKE EXECUTE ON FUNCTION decrement_user_balance_v2 FROM authenticated;
GRANT EXECUTE ON FUNCTION decrement_user_balance_v2 TO service_role;

COMMENT ON FUNCTION decrement_user_balance_v2
  IS 'Dual-pool balance decrement: tries top-up at on-demand rate first, then subscription budget at plan rate';

-- ============================================
-- 5. Create grant_subscription_budget RPC
-- ============================================

CREATE OR REPLACE FUNCTION grant_subscription_budget(
  p_user_id UUID,
  p_budget_cents INTEGER,
  p_event_id TEXT,
  p_event_type TEXT DEFAULT 'invoice.paid',
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_event_exists BOOLEAN;
  v_new_budget INTEGER;
BEGIN
  -- Idempotency check
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

  -- Insert idempotency record
  INSERT INTO processed_stripe_events (event_id, event_type, metadata)
  VALUES (p_event_id, p_event_type, p_metadata);

  -- Reset and grant new budget (no rollover)
  UPDATE user_balance
  SET subscription_budget_cents = p_budget_cents,
      subscription_budget_granted_cents = p_budget_cents,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING subscription_budget_cents INTO v_new_budget;

  -- If no existing record, create one
  IF NOT FOUND THEN
    INSERT INTO user_balance (user_id, balance_cents, subscription_budget_cents, subscription_budget_granted_cents)
    VALUES (p_user_id, 0, p_budget_cents, p_budget_cents)
    RETURNING subscription_budget_cents INTO v_new_budget;
  END IF;

  -- Audit log
  INSERT INTO balance_transactions (
    user_id, amount, balance_after, transaction_type, description, metadata
  ) VALUES (
    p_user_id,
    p_budget_cents,
    v_new_budget,
    'subscription_budget_grant',
    COALESCE(p_description, 'Monthly subscription budget: $' || (p_budget_cents / 100.0)::TEXT),
    p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_subscription_budget_cents', v_new_budget
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'duplicate_event',
      'message', 'Event already processed (race condition)'
    );
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Security: service_role only
REVOKE EXECUTE ON FUNCTION grant_subscription_budget FROM public;
REVOKE EXECUTE ON FUNCTION grant_subscription_budget FROM authenticated;
GRANT EXECUTE ON FUNCTION grant_subscription_budget TO service_role;

COMMENT ON FUNCTION grant_subscription_budget
  IS 'Grants monthly subscription budget with Stripe idempotency checking. Resets budget (no rollover).';
