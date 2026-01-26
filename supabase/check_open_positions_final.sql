-- Check current open positions - FINAL CORRECTED VERSION
SELECT 
  p.market,
  p.size,
  p.side,
  p.avg_entry,
  p.unrealized_pnl,
  p.updated_at
FROM virtual_positions p
JOIN virtual_accounts va ON p.account_id = va.id
WHERE va.session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  AND p.size != 0
ORDER BY p.updated_at DESC;
