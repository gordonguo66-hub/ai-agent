-- Check why virtual session f9196654-85c1-4bee-b8eb-eb8def339eec is not ticking

-- 1. Check session status and last tick time
SELECT 
  id,
  mode,
  status,
  last_tick_at,
  NOW() - last_tick_at as time_since_last_tick,
  created_at
FROM strategy_sessions
WHERE id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';

-- 2. Check if there are any recent decision logs (even errors)
SELECT 
  created_at,
  error,
  ai_bias,
  confidence,
  action
FROM strategy_decisions
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check the strategy configuration
SELECT 
  s.id,
  s.name,
  s.model_provider,
  s.model_name,
  s.saved_api_key_id,
  CASE 
    WHEN s.api_key_ciphertext IS NULL THEN 'NULL'
    WHEN s.api_key_ciphertext = '' THEN 'EMPTY'
    ELSE 'HAS KEY'
  END as key_status,
  ss.status as session_status,
  ss.last_tick_at
FROM strategies s
JOIN strategy_sessions ss ON ss.strategy_id = s.id
WHERE ss.id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';
