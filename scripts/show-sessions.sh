#!/bin/bash
# Show all running sessions with their IDs

echo "📋 Your Running Sessions:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Copy this SQL and run it in Supabase SQL Editor:"
echo ""
cat << 'SQL'
SELECT 
  s.id,
  s.mode,
  s.status,
  s.markets,
  s.cadence_seconds,
  s.started_at,
  s.last_tick_at,
  strat.name as strategy_name,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(s.last_tick_at, s.started_at)))::int as seconds_since_last_tick
FROM strategy_sessions s
LEFT JOIN strategies strat ON s.strategy_id = strat.id
WHERE s.status = 'running'
ORDER BY s.created_at DESC;
SQL

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Then use the correct session ID in your browser URL!"
