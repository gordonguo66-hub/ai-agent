#!/bin/bash
# Kill process on port 3000 multiple times to be sure
for i in {1..3}; do
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
done

# Also killall node processes
killall -9 node 2>/dev/null || true
sleep 2

# Start dev server
cd "/Users/gordon/Desktop/AI Agent"
npm run dev
