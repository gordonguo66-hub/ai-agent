-- Fix missing RLS policies for equity_points table
-- Run this in your Supabase SQL Editor

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view equity points for their accounts" ON equity_points;
DROP POLICY IF EXISTS "Users can insert equity points for their accounts" ON equity_points;

-- Users can only access equity points for their accounts
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
