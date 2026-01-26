-- Check if Test2 strategy has been updated recently
SELECT 
  id,
  name,
  model_provider,
  model_name,
  filters->>'cadenceSeconds' as cadence,
  filters->'aiInputs'->'candles'->>'timeframe' as timeframe,
  saved_api_key_id,
  CASE 
    WHEN api_key_ciphertext IS NULL THEN 'NULL'
    WHEN api_key_ciphertext = '' THEN 'EMPTY'
    ELSE 'HAS KEY'
  END as direct_key,
  created_at,
  updated_at
FROM strategies
WHERE id = '0482df8f-6e38-4c4a-90ac-9042992c630c';

-- Check both sessions using Test2
SELECT 
  ss.id as session_id,
  ss.mode,
  ss.status,
  ss.markets,
  ss.filters->>'cadenceSeconds' as session_cadence,
  ss.last_tick_at,
  ss.created_at,
  s.name as strategy_name,
  s.filters->>'cadenceSeconds' as strategy_cadence
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
WHERE ss.strategy_id = '0482df8f-6e38-4c4a-90ac-9042992c630c'
ORDER BY ss.mode;

-- Check latest decisions for these sessions
SELECT 
  d.session_id,
  ss.mode,
  d.market,
  d.bias,
  d.confidence,
  d.action,
  d.error,
  d.created_at,
  TO_CHAR(d.created_at, 'HH24:MI:SS') as time
FROM ai_decisions d
JOIN strategy_sessions ss ON d.session_id = ss.id
WHERE ss.strategy_id = '0482df8f-6e38-4c4a-90ac-9042992c630c'
ORDER BY d.created_at DESC
LIMIT 20;
