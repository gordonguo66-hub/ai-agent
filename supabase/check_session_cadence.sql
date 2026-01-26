-- Check cadence settings for both sessions
SELECT 
  ss.id as session_id,
  ss.mode,
  ss.cadence_seconds as session_cadence,
  s.filters->'cadenceSeconds' as strategy_cadence,
  ss.last_tick_at,
  ss.started_at,
  COUNT(ep.id) as equity_points_count,
  MIN(ep.t) as first_point,
  MAX(ep.t) as last_point
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
LEFT JOIN equity_points ep ON ss.id = ep.session_id
WHERE ss.id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
GROUP BY ss.id, ss.mode, ss.cadence_seconds, s.filters, ss.last_tick_at, ss.started_at;
