-- Check if the LATEST equity points (after the fix) are smooth
-- This will show the most recent 20 equity points with the change between each point

WITH recent_equity AS (
  SELECT 
    t,
    equity,
    LAG(equity) OVER (ORDER BY t) as prev_equity,
    equity - LAG(equity) OVER (ORDER BY t) as change
  FROM equity_points
  WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  ORDER BY t DESC
  LIMIT 20
)
SELECT 
  to_char(t, 'MM-DD HH24:MI') as time,
  ROUND(equity::numeric, 2) as equity,
  ROUND(change::numeric, 2) as change,
  CASE 
    WHEN ABS(change) > 100 THEN '🚨 BIG JUMP'
    WHEN ABS(change) > 50 THEN '⚠️  Medium'
    ELSE '✅ Smooth'
  END as status
FROM recent_equity
ORDER BY t DESC;
