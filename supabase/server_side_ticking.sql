-- Server-Side Ticking Setup for 24/7 Trading
-- This enables automatic ticking of running sessions even when users are offline
--
-- Option 1: Use Supabase pg_cron (if enabled in your Supabase project)
-- Option 2: Use Vercel Cron (configured in vercel.json)
-- Option 3: Use external cron service (cron-job.org, EasyCron, etc.)

-- ============================================
-- Option 1: Supabase pg_cron (Recommended if available)
-- ============================================
-- First, enable pg_cron extension (requires Supabase Pro or self-hosted)
-- Run this in Supabase SQL Editor:

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cron job to tick all running sessions every minute
-- This will call the API endpoint /api/cron/tick-all-sessions
SELECT cron.schedule(
  'tick-all-running-sessions',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'YOUR_APP_URL/api/cron/tick-all-sessions',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- To update the schedule:
-- SELECT cron.unschedule('tick-all-running-sessions');
-- Then run the SELECT cron.schedule() again with new URL

-- ============================================
-- Option 2: Vercel Cron (Already configured in vercel.json)
-- ============================================
-- The vercel.json file already has the cron configuration.
-- Just deploy to Vercel and it will run automatically.
-- Make sure to set CRON_SECRET environment variable in Vercel.

-- ============================================
-- Option 3: External Cron Service
-- ============================================
-- Use a service like cron-job.org or EasyCron:
-- 1. Create a new cron job
-- 2. Set schedule: Every 1 minute (* * * * *)
-- 3. URL: https://your-app.vercel.app/api/cron/tick-all-sessions
-- 4. Method: GET
-- 5. Headers: Authorization: Bearer YOUR_CRON_SECRET

-- ============================================
-- Environment Variables Required
-- ============================================
-- Add these to your .env.local and Vercel environment:
-- CRON_SECRET=your-random-secret-key-here
-- INTERNAL_API_KEY=your-random-secret-key-here (can be same as CRON_SECRET)
-- NEXT_PUBLIC_APP_URL=https://your-app.vercel.app (for Vercel Cron)

-- ============================================
-- How It Works
-- ============================================
-- 1. Cron job runs every minute
-- 2. Fetches all sessions with status='running'
-- 3. For each session, checks if cadence time has passed
-- 4. Calls the tick endpoint for sessions that need ticking
-- 5. Sessions tick independently based on their configured cadence

-- ============================================
-- Testing
-- ============================================
-- Test the cron endpoint manually:
-- curl -X GET "https://your-app.vercel.app/api/cron/tick-all-sessions" \
--   -H "Authorization: Bearer YOUR_CRON_SECRET"
