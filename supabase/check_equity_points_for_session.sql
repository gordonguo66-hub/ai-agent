-- Check equity points for session f9196654
-- to see if recent data actually exists in the database

-- Get session and account info
SELECT 
  ss.id as session_id,
  ss.mode,
  ss.status,
  ss.started_at,
  ss.last_tick_at,
  CASE 
    WHEN ss.mode = 'virtual' THEN va.id
    WHEN ss.mode = 'live' THEN la.id
    WHEN ss.mode = 'arena' THEN va.id
  END as account_id
FROM strategy_sessions ss
LEFT JOIN virtual_accounts va ON ss.id = va.session_id
LEFT JOIN live_accounts la ON ss.id = la.session_id
WHERE ss.id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';

-- Check the most recent equity points for this session
SELECT 
  ep.t as timestamp,
  ep.equity,
  ep.session_id,
  ep.account_id,
  TO_CHAR(ep.t, 'YYYY-MM-DD HH24:MI:SS') as formatted_time,
  EXTRACT(EPOCH FROM (NOW() - ep.t)) / 60 as minutes_ago
FROM equity_points ep
WHERE ep.session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
ORDER BY ep.t DESC
LIMIT 20;

-- Check total count
SELECT COUNT(*) as total_points
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';

-- Check if there are any equity points in the last hour
SELECT 
  COUNT(*) as points_in_last_hour,
  MIN(t) as oldest,
  MAX(t) as newest
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
AND t > NOW() - INTERVAL '1 hour';
