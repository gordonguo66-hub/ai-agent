-- CORRECTED QUERIES with proper table names

-- Query 1: Check current open positions
SELECT 
  p.market,
  p.size,
  p.side,
  p.entry_price,
  p.unrealized_pnl,
  p.created_at
FROM virtual_positions p
JOIN virtual_accounts va ON p.account_id = va.id
WHERE va.session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  AND p.size != 0
ORDER BY p.created_at DESC;

-- Query 2: Check recent trades
-- SELECT 
--   market,
--   side,
--   size,
--   price,
--   realized_pnl,
--   created_at
-- FROM virtual_trades
-- WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
-- ORDER BY created_at DESC
-- LIMIT 20;

-- Query 3: Check account cash balance
-- SELECT 
--   cash_balance,
--   equity,
--   initial_balance
-- FROM virtual_accounts
-- WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';
