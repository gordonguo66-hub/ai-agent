-- Check which markets this session is trading
SELECT 
  ss.id as session_id,
  ss.markets,
  s.name as strategy_name,
  s.filters->'markets' as strategy_markets
FROM strategy_sessions ss
JOIN strategies s ON s.id = ss.strategy_id
WHERE ss.id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';
