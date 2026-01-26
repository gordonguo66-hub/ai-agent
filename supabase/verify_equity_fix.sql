-- ✅ Verify Equity Spike Fix is Working
-- Run this query to confirm no more fake equity spikes

-- 1. Check recent equity points for your session
-- Replace 'YOUR_SESSION_ID' with your actual session ID
SELECT 
  t,
  equity,
  equity - LAG(equity) OVER (ORDER BY t) as equity_change,
  EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as seconds_since_last
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec' -- Your virtual session
  AND t >= NOW() - INTERVAL '30 minutes'
ORDER BY t DESC
LIMIT 30;

-- ✅ EXPECTED RESULTS (FIXED):
-- - equity_change: Should be small values (-$100 to +$100)
-- - seconds_since_last: Should be ~60 seconds apart (cadence)
-- - NO MORE massive ±$650-700 spikes
-- - NO MORE points that are 3 seconds apart

-- ❌ BEFORE FIX (BUGGY):
-- - equity_change: Had massive ±$650-700 swings
-- - seconds_since_last: Some points only 3 seconds apart
-- - Pattern: drop $650, then 3 seconds later jump $650 back


-- 2. Check for any equity points that are too close together (< 10 seconds)
-- This should return 0 rows after the fix
SELECT 
  t,
  equity,
  t - LAG(t) OVER (ORDER BY t) as time_gap,
  equity - LAG(equity) OVER (ORDER BY t) as equity_change
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  AND t >= NOW() - INTERVAL '1 hour'
ORDER BY t DESC;

-- ✅ EXPECTED: All time_gap values should be ~60 seconds (your cadence)
-- ❌ BUGGY: Would show some time_gap of 3-5 seconds


-- 3. Find maximum equity change in recent history
SELECT 
  MAX(ABS(equity - LAG(equity) OVER (ORDER BY t))) as max_equity_change,
  AVG(ABS(equity - LAG(equity) OVER (ORDER BY t))) as avg_equity_change,
  COUNT(*) as total_points
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  AND t >= NOW() - INTERVAL '1 hour';

-- ✅ EXPECTED (FIXED):
-- - max_equity_change: < $200 (normal market fluctuation)
-- - avg_equity_change: < $50
-- - total_points: ~60 (one per minute for 1 hour)

-- ❌ BEFORE FIX (BUGGY):
-- - max_equity_change: ~$700 (fake spike)
-- - avg_equity_change: High due to spikes
-- - total_points: ~120 (double, due to recording after each trade too)
