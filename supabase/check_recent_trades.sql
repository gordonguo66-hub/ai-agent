-- Check recent virtual trades for debugging
SELECT 
  id,
  account_id,
  session_id,
  market,
  action,
  side,
  size,
  price,
  fee,
  realized_pnl,
  created_at
FROM virtual_trades
ORDER BY created_at DESC
LIMIT 20;

-- Also check if account exists
SELECT id, user_id, starting_equity, equity, cash_balance, created_at
FROM virtual_accounts
ORDER BY created_at DESC
LIMIT 10;

-- Check if positions exist
SELECT id, account_id, market, side, size, avg_entry, unrealized_pnl, created_at
FROM virtual_positions
ORDER BY created_at DESC
LIMIT 10;
