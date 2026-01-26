#!/bin/bash
# Local development cron for ticking sessions
# Run this in a separate terminal: ./scripts/local-cron.sh
# Or to prevent Mac sleep: caffeinate -i ./scripts/local-cron.sh
#
# PRECISION FIX: Uses wall-clock alignment instead of simple sleep
# This ensures ticks happen at consistent 60-second intervals regardless of processing time

# Hardcode for local development - matches .env.local
INTERNAL_API_KEY="local-dev-key-1768949025"

echo "🔄 Local Cron Started - Ticking sessions every 60 seconds (wall-clock aligned)"
echo "📍 INTERNAL_API_KEY: ${INTERNAL_API_KEY:0:20}..."
echo "🌐 Endpoint: http://localhost:3000/api/cron/tick-all-sessions"
echo ""
echo "Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run immediately on start
run_tick() {
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$TIMESTAMP] 🎯 Triggering tick-all-sessions..."
  
  RESPONSE=$(curl -s -X GET "http://localhost:3000/api/cron/tick-all-sessions" \
    -H "Authorization: Bearer $INTERNAL_API_KEY" \
    -w "\nHTTP_STATUS:%{http_code}" \
    --connect-timeout 5 \
    --max-time 30)
  
  HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
  BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
  
  if [ "$HTTP_STATUS" = "200" ]; then
    PROCESSED=$(echo "$BODY" | grep -o '"processed":[0-9]*' | cut -d':' -f2)
    SKIPPED=$(echo "$BODY" | grep -o '"skipped":[0-9]*' | cut -d':' -f2)
    echo "[$TIMESTAMP] ✅ Success: Processed $PROCESSED, Skipped $SKIPPED"
  else
    echo "[$TIMESTAMP] ❌ Failed: HTTP $HTTP_STATUS"
    echo "$BODY" | head -2
  fi
  echo ""
}

# Run first tick immediately
run_tick

# Main loop - align to wall clock for precision
while true; do
  # Calculate seconds until next minute boundary
  CURRENT_SECOND=$(date +%S)
  CURRENT_SECOND=$((10#$CURRENT_SECOND))  # Remove leading zeros
  SLEEP_SECONDS=$((60 - CURRENT_SECOND))
  
  # If we're within 2 seconds of the minute, wait for next minute
  if [ $SLEEP_SECONDS -lt 3 ]; then
    SLEEP_SECONDS=$((SLEEP_SECONDS + 60))
  fi
  
  # Sleep until the next minute boundary
  sleep $SLEEP_SECONDS
  
  # Run the tick
  run_tick
done
