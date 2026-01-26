-- Create equity_points table and RLS policies
-- Run this in your Supabase SQL Editor FIRST

-- 1. Create the equity_points table if it doesn't exist
CREATE TABLE IF NOT EXISTS equity_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES virtual_accounts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES strategy_sessions(id) ON DELETE CASCADE,
  t TIMESTAMPTZ DEFAULT NOW(),
  equity NUMERIC NOT NULL
);

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_equity_points_account_id ON equity_points(account_id);
CREATE INDEX IF NOT EXISTS idx_equity_points_session_id ON equity_points(session_id);

-- 3. Enable RLS
ALTER TABLE equity_points ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view equity points for their accounts" ON equity_points;
DROP POLICY IF EXISTS "Users can insert equity points for their accounts" ON equity_points;

-- 5. Create RLS policies
CREATE POLICY "Users can view equity points for their accounts"
  ON equity_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = equity_points.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert equity points for their accounts"
  ON equity_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = equity_points.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
  );
