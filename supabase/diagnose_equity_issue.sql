-- DIAGNOSTIC QUERY FOR EQUITY CHART ISSUE
-- Run this in Supabase SQL Editor to diagnose the fake data problem

-- First, get your session ID (should be: f9196654-85c1-4bee-b8eb-eb8def339eec)
-- If you see it in the URL, skip this and go straight to the diagnostic queries below

-- Query 1: Check equity points pattern (look for rapid consecutive points)
SELECT 
  t,
  equity,
  equity - LAG(equity) OVER (ORDER BY t) as change,
  ROUND(EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t)))::numeric, 1) as seconds_gap
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
ORDER BY t DESC
LIMIT 50;

-- Query 2: Find the spike at 23:07
-- SELECT 
--   TO_CHAR(t, 'HH24:MI:SS') as time,
--   ROUND(equity::numeric, 2) as equity,
--   ROUND((equity - LAG(equity) OVER (ORDER BY t))::numeric, 2) as change
-- FROM equity_points
-- WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
--   AND t BETWEEN '2026-01-25 23:00:00' AND '2026-01-25 23:15:00'
-- ORDER BY t;

-- Query 3: Count points per minute (should be ~1, but if bug exists will be 2+)
-- SELECT 
--   DATE_TRUNC('minute', t) as minute,
--   COUNT(*) as points_count,
--   STRING_AGG(TO_CHAR(t, 'HH24:MI:SS'), ', ' ORDER BY t) as times
-- FROM equity_points
-- WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
--   AND t > NOW() - INTERVAL '2 hours'
-- GROUP BY DATE_TRUNC('minute', t)
-- HAVING COUNT(*) > 1
-- ORDER BY minute DESC
-- LIMIT 20;

-- Query 4: Find all rapid consecutive points (within 10 seconds)
-- WITH gaps AS (
--   SELECT 
--     t,
--     equity,
--     LAG(t) OVER (ORDER BY t) as prev_t,
--     LAG(equity) OVER (ORDER BY t) as prev_equity,
--     EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as seconds_gap
--   FROM equity_points
--   WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
-- )
-- SELECT 
--   TO_CHAR(t, 'YYYY-MM-DD HH24:MI:SS') as time,
--   ROUND(equity::numeric, 2) as equity,
--   ROUND((equity - prev_equity)::numeric, 2) as change,
--   ROUND(seconds_gap::numeric, 1) as gap_seconds
-- FROM gaps
-- WHERE seconds_gap < 10 AND seconds_gap IS NOT NULL
-- ORDER BY t DESC
-- LIMIT 50;
