#!/bin/bash
# Clean restart script for Next.js dev server
# Use this if you encounter "Cannot find module" errors or blank pages

echo "🧹 Cleaning build cache..."
rm -rf .next
rm -rf node_modules/.cache

echo "🛑 Stopping any running dev server on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting fresh dev server..."
npm run dev -- --port 3000
