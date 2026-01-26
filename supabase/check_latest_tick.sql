-- Check the most recent tick time for the virtual session
SELECT 
  id,
  mode,
  status,
  last_tick_at,
  NOW() - last_tick_at as time_since_tick,
  (SELECT created_at FROM strategy_decisions WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec' ORDER BY created_at DESC LIMIT 1) as latest_decision_at,
  (SELECT equity FROM equity_points WHERE account_id IN (SELECT account_id FROM strategy_sessions WHERE id = 'f9196654-85c1-4bee-b8eb-eb8def339eec') ORDER BY created_at DESC LIMIT 1) as latest_equity
FROM strategy_sessions
WHERE id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';
