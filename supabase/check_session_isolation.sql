-- Check if equity points are mixed between sessions
-- Virtual session: f9196654-85c1-4bee-b8eb-eb8def339eec
-- Arena session: feee2479-b1ab-4205-9def-a3a05f1ac1cd

-- 1. Check equity points for virtual session
SELECT 
  'Virtual Session' as label,
  COUNT(*) as equity_points_count,
  MIN(equity) as min_equity,
  MAX(equity) as max_equity,
  MAX(equity) - MIN(equity) as swing_range
FROM equity_points
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';

-- 2. Check equity points for arena session  
-- SELECT 
--   'Arena Session' as label,
--   COUNT(*) as equity_points_count,
--   MIN(equity) as min_equity,
--   MAX(equity) as max_equity,
--   MAX(equity) - MIN(equity) as swing_range
-- FROM equity_points
-- WHERE session_id = 'feee2479-b1ab-4205-9def-a3a05f1ac1cd';

-- 3. Check if any equity points have wrong account_id
-- SELECT 
--   ep.session_id,
--   ep.account_id as equity_point_account_id,
--   ss.account_id as session_account_id,
--   CASE 
--     WHEN ep.account_id = ss.account_id THEN 'CORRECT'
--     ELSE 'WRONG ACCOUNT ID!!!'
--   END as status
-- FROM equity_points ep
-- JOIN strategy_sessions ss ON ep.session_id = ss.id
-- WHERE ep.session_id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
-- ORDER BY ep.t DESC
-- LIMIT 20;

-- 4. Check if virtual session has equity points from BOTH accounts
-- SELECT 
--   DISTINCT account_id,
--   COUNT(*) as points_count
-- FROM equity_points
-- WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
-- GROUP BY account_id;
