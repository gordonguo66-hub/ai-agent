-- Check candle settings in strategies
SELECT 
  s.id,
  s.name,
  s.filters->'aiInputs'->'candles' as candle_settings
FROM strategies s
WHERE s.name IN ('Test2', 'Test 3 ')
ORDER BY s.created_at DESC;
