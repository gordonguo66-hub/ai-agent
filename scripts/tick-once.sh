#!/bin/bash
# Quick script to manually trigger tick-all-sessions once (for testing)

# Hardcode for local development - matches .env.local
INTERNAL_API_KEY="local-dev-key-1768949025"

echo "✅ Using INTERNAL_API_KEY for local development"

echo "🎯 Manually triggering tick-all-sessions..."
echo ""

curl -X GET "http://localhost:3000/api/cron/tick-all-sessions" \
  -H "Authorization: Bearer $INTERNAL_API_KEY" \
  -w "\n\nHTTP Status: %{http_code}\n" | jq '.'

echo ""
echo "✅ Done. Check your session page for updates."
