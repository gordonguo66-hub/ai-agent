-- Compare the two sessions using the same strategy
-- Find the working arena session and broken virtual session

SELECT 
  ss.id as session_id,
  ss.mode,
  ss.status,
  ss.created_at,
  s.id as strategy_id,
  s.name as strategy_name,
  s.filters->'aiInputs'->'candles'->>'timeframe' as timeframe,
  s.filters->'aiInputs'->'candles'->'timeframe' as timeframe_raw_json,
  pg_typeof(s.filters->'aiInputs'->'candles'->'timeframe') as timeframe_type,
  s.api_key_ciphertext IS NOT NULL as has_direct_key,
  s.saved_api_key_id IS NOT NULL as has_saved_key,
  ss.last_tick_at
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
WHERE ss.strategy_id = (
  -- Find the strategy that has both virtual and arena sessions
  SELECT strategy_id 
  FROM strategy_sessions 
  WHERE id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
  LIMIT 1
)
ORDER BY ss.mode, ss.created_at;

-- Also show the raw JSON to see exactly what's stored
SELECT 
  ss.id as session_id,
  ss.mode,
  s.filters->'aiInputs'->'candles' as candles_config
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
WHERE ss.id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd');
