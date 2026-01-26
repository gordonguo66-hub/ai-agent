-- Compare RECENT equity points from both sessions (last 20 points each)
WITH virtual_recent AS (
  SELECT 
    t,
    equity,
    equity - LAG(equity) OVER (ORDER BY t) as change,
    EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as gap_seconds
  FROM equity_points
  WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  ORDER BY t DESC
  LIMIT 20
),
arena_recent AS (
  SELECT 
    t,
    equity,
    equity - LAG(equity) OVER (ORDER BY t) as change,
    EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as gap_seconds
  FROM equity_points
  WHERE session_id = 'feee2479-b1ab-4205-9def-a3a05f1ac1cd'
  ORDER BY t DESC
  LIMIT 20
)
SELECT 
  'Virtual' as type,
  TO_CHAR(t, 'MM-DD HH24:MI') as time,
  ROUND(equity::numeric, 2) as equity,
  ROUND(change::numeric, 2) as change,
  ROUND(gap_seconds::numeric, 0) as gap_sec
FROM virtual_recent
WHERE change IS NOT NULL
ORDER BY t DESC
LIMIT 10;

-- Run this separately for Arena:
-- SELECT 
--   'Arena' as type,
--   TO_CHAR(t, 'MM-DD HH24:MI') as time,
--   ROUND(equity::numeric, 2) as equity,
--   ROUND(change::numeric, 2) as change,
--   ROUND(gap_seconds::numeric, 0) as gap_sec
-- FROM arena_recent
-- WHERE change IS NOT NULL
-- ORDER BY t DESC
-- LIMIT 10;
