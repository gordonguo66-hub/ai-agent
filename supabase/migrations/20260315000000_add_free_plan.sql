-- Migration: Re-add Free Plan with $10 Signup Credit
-- Date: 2026-03-15
--
-- Adds a free tier for new signups:
-- - $10 signup credit (~$5 real cost at on_demand 100% markup)
-- - DeepSeek models only
-- - 1 market per strategy
-- - 1 active session
-- - 10-minute minimum cadence
-- - Paper + Arena trading only (no live)
--
-- Restrictions lift when user tops up or subscribes.
-- Existing users are NOT affected.

-- ============================================
-- 1. Insert free plan into subscription_plans
-- ============================================

INSERT INTO subscription_plans (id, name, description, price_cents, credits_per_period, features, is_active)
VALUES (
  'free',
  'Free',
  'Get started with AI trading',
  0,
  0,
  '["$10 signup credit", "DeepSeek models", "1 market per strategy", "1 active session", "Paper & arena trading", "10-minute minimum cadence"]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  credits_per_period = EXCLUDED.credits_per_period,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;

-- ============================================
-- 2. Update initialize_user_credits() trigger
--    New users get free plan + $10 credit
-- ============================================

CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user_balance record with $10 signup credit (1000 cents)
  INSERT INTO public.user_balance (user_id, balance_cents)
  VALUES (NEW.id, 1000)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create user_subscription record with free plan (active)
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;

  -- Record the signup bonus transaction
  INSERT INTO public.balance_transactions (
    user_id, amount, balance_after, transaction_type, description, metadata
  ) VALUES (
    NEW.id, 1000, 1000, 'signup_bonus', 'Free tier signup credit ($10.00)',
    '{"source": "free_tier_signup"}'::jsonb
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.initialize_user_credits();
