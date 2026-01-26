-- Check the actual last_tick_at for the virtual session
SELECT 
  id,
  mode,
  status,
  last_tick_at,
  NOW() - last_tick_at as time_since_last_tick,
  cadence_seconds,
  created_at
FROM strategy_sessions
WHERE id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';
