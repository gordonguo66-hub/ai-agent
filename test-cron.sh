#!/bin/bash
# Test script for the cron endpoint
# Replace YOUR_APP_URL with your actual Vercel URL

APP_URL="https://your-app.vercel.app"  # CHANGE THIS
CRON_SECRET="5eec5617f8bc49eab28d1c1ad582ebaae829b30eb11ad53aadad0885526b3f3c"

echo "Testing cron endpoint..."
curl -X GET "${APP_URL}/api/cron/tick-all-sessions" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json"

echo ""
echo "Done!"
