-- Get account_id for this session
SELECT 
  ss.id as session_id,
  ss.account_id,
  va.cash_balance,
  va.equity
FROM strategy_sessions ss
JOIN virtual_accounts va ON ss.account_id = va.id
WHERE ss.id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';
