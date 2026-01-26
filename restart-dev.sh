#!/bin/bash
# Kill all Node processes
echo "🔴 Killing all Node processes..."
pkill -9 node
sleep 2

# Navigate to project directory
cd "/Users/gordon/Desktop/AI Agent"

# Start dev server
echo "🚀 Starting fresh dev server..."
npm run dev
