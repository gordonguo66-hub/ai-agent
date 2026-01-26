-- Cleanup bad equity points that were created by the virtualBroker bug
-- These are the "fake spikes" where equity was recorded with stale prices

-- First, let's identify the session
-- Replace this with your actual session_id
DO $$
DECLARE
  target_session_id uuid := 'f9196654-85c1-4bee-b8eb-eb8def339eec'; -- Replace with your session ID
  account_uuid uuid;
BEGIN
  -- Get the account_id for this session
  SELECT account_id INTO account_uuid
  FROM strategy_sessions
  WHERE id = target_session_id;
  
  RAISE NOTICE 'Cleaning equity points for session: %, account: %', target_session_id, account_uuid;
  
  -- Delete equity points that look like they were recorded by the bug
  -- The bug created rapid consecutive points (within seconds) with wild swings
  -- We'll keep only one point per minute to remove the duplicates
  
  WITH ranked_points AS (
    SELECT 
      id,
      t,
      equity,
      LAG(equity) OVER (ORDER BY t) as prev_equity,
      LAG(t) OVER (ORDER BY t) as prev_t,
      -- Calculate time difference in seconds
      EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as seconds_since_prev,
      -- Calculate equity change
      equity - LAG(equity) OVER (ORDER BY t) as equity_change,
      ROW_NUMBER() OVER (
        PARTITION BY DATE_TRUNC('minute', t)
        ORDER BY t DESC
      ) as rn_per_minute
    FROM equity_points
    WHERE 
      account_id = account_uuid
      AND session_id = target_session_id
    ORDER BY t
  ),
  bad_points AS (
    -- Points that are likely bad:
    -- 1. Not the latest point in their minute (duplicates)
    -- OR
    -- 2. Points within 10 seconds of previous with huge swings (>$100)
    SELECT id
    FROM ranked_points
    WHERE 
      rn_per_minute > 1  -- Keep only the latest point per minute
      OR (
        seconds_since_prev IS NOT NULL 
        AND seconds_since_prev < 10 
        AND ABS(equity_change) > 100
      )
  )
  DELETE FROM equity_points
  WHERE id IN (SELECT id FROM bad_points);
  
  RAISE NOTICE 'Cleanup complete';
END $$;

-- Alternative: If you want to see what would be deleted first, comment out the DELETE above
-- and uncomment this to preview:
/*
WITH ranked_points AS (
  SELECT 
    id,
    t,
    equity,
    LAG(equity) OVER (ORDER BY t) as prev_equity,
    LAG(t) OVER (ORDER BY t) as prev_t,
    EXTRACT(EPOCH FROM (t - LAG(t) OVER (ORDER BY t))) as seconds_since_prev,
    equity - LAG(equity) OVER (ORDER BY t) as equity_change,
    ROW_NUMBER() OVER (
      PARTITION BY DATE_TRUNC('minute', t)
      ORDER BY t DESC
    ) as rn_per_minute
  FROM equity_points
  WHERE 
    session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
  ORDER BY t
)
SELECT 
  t,
  equity,
  prev_equity,
  equity_change,
  seconds_since_prev,
  CASE 
    WHEN rn_per_minute > 1 THEN 'Duplicate in minute'
    WHEN seconds_since_prev < 10 AND ABS(equity_change) > 100 THEN 'Rapid spike'
    ELSE 'OK'
  END as reason
FROM ranked_points
WHERE 
  rn_per_minute > 1
  OR (seconds_since_prev < 10 AND ABS(equity_change) > 100)
ORDER BY t DESC
LIMIT 50;
*/
