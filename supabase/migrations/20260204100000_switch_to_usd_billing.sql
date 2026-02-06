-- Migration: Switch from Credits to USD-Based Billing
-- Date: 2026-02-04
--
-- This migration updates the billing system from credits to direct USD billing.
-- - Balance is now stored in cents (integer) for precision
-- - Subscription tiers provide better rates (more AI usage per dollar)
-- - Pro: 25% more AI usage, Pro+: 38% more, Ultra: 54% more
--
-- NOTE: This migration is idempotent - it handles cases where:
-- - Tables don't exist yet (creates them)
-- - Tables already have old names (renames them)
-- - Tables already have new names (skips rename)

-- ============================================
-- ENSURE user_balance TABLE EXISTS
-- ============================================

-- First, try to create the table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS user_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_spent_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- If user_credits exists with old column names, migrate the data
DO $$
BEGIN
  -- Check if user_credits table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_credits') THEN
    -- Migrate data from user_credits to user_balance
    INSERT INTO user_balance (id, user_id, balance_cents, lifetime_spent_cents, created_at, updated_at)
    SELECT
      id,
      user_id,
      COALESCE(credits_balance, 0) as balance_cents,
      COALESCE(lifetime_credits_used, 0) as lifetime_spent_cents,
      created_at,
      updated_at
    FROM user_credits
    ON CONFLICT (user_id) DO UPDATE SET
      balance_cents = EXCLUDED.balance_cents,
      lifetime_spent_cents = EXCLUDED.lifetime_spent_cents;

    -- Drop the old table
    DROP TABLE user_credits;
    RAISE NOTICE 'Migrated user_credits to user_balance';
  END IF;
END $$;

-- ============================================
-- UPDATE SUBSCRIPTION PLANS
-- ============================================

-- Add markup_percent column to subscription_plans if it doesn't exist
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS markup_percent INTEGER;

-- Update existing plans with new pricing
-- Pro: $19/mo - 25% more AI usage
-- Pro+: $89/mo - 38% more AI usage
-- Ultra: $249/mo - 54% more AI usage

UPDATE subscription_plans SET
  price_cents = 1900,
  markup_percent = 60,
  features = '["25% more AI usage", "Paper & live trading", "5 active strategies", "Priority support"]'::jsonb
WHERE id = 'pro';

UPDATE subscription_plans SET
  price_cents = 8900,
  markup_percent = 45,
  features = '["38% more AI usage", "Paper & live trading", "Unlimited strategies", "Priority support", "Advanced analytics"]'::jsonb
WHERE id = 'pro_plus';

UPDATE subscription_plans SET
  price_cents = 24900,
  markup_percent = 30,
  features = '["54% more AI usage", "Paper & live trading", "Unlimited strategies", "Dedicated support", "Advanced analytics", "Early access to features"]'::jsonb
WHERE id = 'ultra';

-- ============================================
-- ENSURE balance_transactions TABLE EXISTS
-- ============================================

-- Create balance_transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('subscription_grant', 'usage', 'purchase', 'refund', 'adjustment', 'signup_bonus', 'topup')),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- If credit_transactions exists, migrate the data
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_transactions') THEN
    -- Migrate data
    INSERT INTO balance_transactions (id, user_id, amount, balance_after, transaction_type, description, metadata, created_at)
    SELECT id, user_id, amount, balance_after, transaction_type, description, metadata, created_at
    FROM credit_transactions
    ON CONFLICT (id) DO NOTHING;

    -- Drop old table
    DROP TABLE credit_transactions;
    RAISE NOTICE 'Migrated credit_transactions to balance_transactions';
  END IF;
END $$;

-- ============================================
-- UPDATE INDEXES
-- ============================================

-- Create indexes (IF NOT EXISTS handles duplicates)
CREATE INDEX IF NOT EXISTS idx_user_balance_user_id ON user_balance(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON balance_transactions(created_at DESC);

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- UPDATE RLS POLICIES
-- ============================================

-- Drop old policies if they exist (ignore errors)
DROP POLICY IF EXISTS "Users can read own credits" ON user_balance;
DROP POLICY IF EXISTS "Users can read own credit transactions" ON balance_transactions;
DROP POLICY IF EXISTS "Users can read own balance" ON user_balance;
DROP POLICY IF EXISTS "Users can read own balance transactions" ON balance_transactions;

-- Create policies
CREATE POLICY "Users can read own balance"
  ON user_balance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own balance transactions"
  ON balance_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- UPDATE TRIGGER FUNCTION
-- ============================================

-- Update the initialization function for new users
CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user_balance record with 0 balance
  INSERT INTO public.user_balance (user_id, balance_cents)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create user_subscription record with no plan (inactive)
  INSERT INTO public.user_subscriptions (user_id, status)
  VALUES (NEW.id, 'inactive')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists for new user initialization
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.initialize_user_credits();

-- Update trigger for balance table
DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_balance;
DROP TRIGGER IF EXISTS update_user_balance_updated_at ON user_balance;
CREATE TRIGGER update_user_balance_updated_at
  BEFORE UPDATE ON user_balance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ADD HELPFUL COMMENTS
-- ============================================

COMMENT ON TABLE user_balance IS 'User balance stored in cents (1 cent = $0.01). Replaces legacy credits system.';
COMMENT ON COLUMN user_balance.balance_cents IS 'Current balance in cents. 100 = $1.00';
COMMENT ON COLUMN user_balance.lifetime_spent_cents IS 'Total amount spent in cents across all time.';

COMMENT ON TABLE balance_transactions IS 'Audit log of all balance changes (additions and deductions).';
COMMENT ON COLUMN balance_transactions.amount IS 'Amount in cents. Positive for additions, negative for usage.';
COMMENT ON COLUMN balance_transactions.balance_after IS 'Balance in cents after this transaction.';

COMMENT ON COLUMN subscription_plans.markup_percent IS 'Internal pricing rate. Not exposed to users.';
COMMENT ON COLUMN subscription_plans.price_cents IS 'Monthly subscription price in cents.';
