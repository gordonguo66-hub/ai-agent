-- Compare equity volatility between virtual and arena sessions
-- Virtual: f9196654-85c1-4bee-b8eb-eb8def339eec
-- Arena: feee2479-b1ab-4205-9def-a3a05f1ac1cd

-- Get recent equity points from BOTH sessions to compare
WITH virtual_equity AS (
  SELECT 
    t,
    equity,
    equity - LAG(equity) OVER (ORDER BY t) as change,
    EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as gap_seconds
  FROM equity_points
  WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
    AND t > NOW() - INTERVAL '2 hours'
  ORDER BY t DESC
  LIMIT 20
),
arena_equity AS (
  SELECT 
    t,
    equity,
    equity - LAG(equity) OVER (ORDER BY t) as change,
    EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as gap_seconds
  FROM equity_points
  WHERE session_id = 'feee2479-b1ab-4205-9def-a3a05f1ac1cd'
    AND t > NOW() - INTERVAL '2 hours'
  ORDER BY t DESC
  LIMIT 20
)
SELECT 
  'Virtual' as session_type,
  TO_CHAR(t, 'HH24:MI:SS') as time,
  ROUND(equity::numeric, 2) as equity,
  ROUND(change::numeric, 2) as change,
  ROUND(gap_seconds::numeric, 1) as gap_sec
FROM virtual_equity
WHERE change IS NOT NULL

UNION ALL

SELECT 
  'Arena' as session_type,
  TO_CHAR(t, 'HH24:MI:SS') as time,
  ROUND(equity::numeric, 2) as equity,
  ROUND(change::numeric, 2) as change,
  ROUND(gap_seconds::numeric, 1) as gap_sec
FROM arena_equity
WHERE change IS NOT NULL

ORDER BY session_type, time DESC
LIMIT 40;
