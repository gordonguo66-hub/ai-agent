-- Check when sessions last ticked and when they should tick next
SELECT 
  id,
  mode,
  status,
  last_tick_at,
  EXTRACT(EPOCH FROM (NOW() - last_tick_at)) as seconds_since_last_tick,
  (filters->>'cadenceSeconds')::int as cadence_seconds,
  (filters->>'cadenceSeconds')::int - EXTRACT(EPOCH FROM (NOW() - last_tick_at)) as seconds_until_next_tick,
  TO_CHAR(last_tick_at + ((filters->>'cadenceSeconds')::int || ' seconds')::interval, 'HH24:MI:SS') as next_tick_time
FROM strategy_sessions
WHERE id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
ORDER BY mode;
