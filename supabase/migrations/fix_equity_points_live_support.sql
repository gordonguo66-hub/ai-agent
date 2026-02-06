-- Fix equity_points to support BOTH virtual and live accounts
-- Current issue: equity_points only references virtual_accounts, breaking live mode

-- 1. Drop the existing foreign key constraint
ALTER TABLE equity_points 
DROP CONSTRAINT IF EXISTS equity_points_account_id_fkey;

-- 2. Add a flexible check: account must exist in EITHER virtual_accounts OR live_accounts
-- This allows equity tracking for both modes
ALTER TABLE equity_points
ADD CONSTRAINT equity_points_account_check
CHECK (
  EXISTS (SELECT 1 FROM virtual_accounts WHERE id = account_id)
  OR EXISTS (SELECT 1 FROM live_accounts WHERE id = account_id)
);

-- 3. Update RLS policies to support both account types
DROP POLICY IF EXISTS "Users can view equity points for their accounts" ON equity_points;
DROP POLICY IF EXISTS "Users can insert equity points for their accounts" ON equity_points;

CREATE POLICY "Users can view equity points for their accounts"
  ON equity_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM virtual_accounts
      WHERE virtual_accounts.id = equity_points.account_id
      AND virtual_accounts.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM live_accounts
      WHERE live_accounts.id = equity_points.account_id
      AND live_accounts.user_id = auth.uid()
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
    OR EXISTS (
      SELECT 1 FROM live_accounts
      WHERE live_accounts.id = equity_points.account_id
      AND live_accounts.user_id = auth.uid()
    )
  );

-- 4. Also allow service role to insert (for server-side equity tracking)
CREATE POLICY "Service role can insert equity points"
  ON equity_points FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
  );
