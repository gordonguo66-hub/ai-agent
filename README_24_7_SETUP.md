# 24/7 Trading Setup Guide

## Problem
The trading system currently runs client-side (in your browser), which means it stops when:
- You close your laptop
- You close the browser tab
- Your computer goes to sleep
- You lose internet connection

## Solution
We've implemented a **server-side cron job** that runs 24/7 on the cloud, automatically ticking all running sessions even when you're offline.

## Setup Instructions

### Step 1: Set Environment Variables

Add these to your `.env.local` and Vercel environment variables:

```bash
# Required for cron authentication
CRON_SECRET=your-random-secret-key-here-min-32-chars
INTERNAL_API_KEY=your-random-secret-key-here-min-32-chars

# Required for Vercel Cron (if using Vercel)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**Generate a secure secret:**
```bash
# On Mac/Linux:
openssl rand -hex 32

# Or use any random string generator (minimum 32 characters)
```

### Step 2: Choose Your Cron Solution

#### Option A: Vercel Cron (Recommended - Easiest)

If you're deploying to Vercel:

1. The `vercel.json` file is already configured
2. Just deploy your app to Vercel
3. Vercel will automatically run the cron job every minute
4. No additional setup needed!

**Deploy:**
```bash
vercel --prod
```

#### Option B: External Cron Service (Works with any hosting)

Use a service like [cron-job.org](https://cron-job.org) or [EasyCron](https://www.easycron.com):

1. Sign up for a free account
2. Create a new cron job:
   - **URL**: `https://your-app.vercel.app/api/cron/tick-all-sessions`
   - **Method**: GET
   - **Schedule**: Every 1 minute (`* * * * *`)
   - **Headers**: 
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```
3. Save and activate

#### Option C: Supabase pg_cron (Advanced)

If you have Supabase Pro or self-hosted Supabase:

1. Run the SQL in `supabase/server_side_ticking.sql`
2. Update the URL in the SQL to match your app URL
3. The cron job will run automatically

### Step 3: Verify It's Working

1. Start a trading session
2. Close your browser/laptop
3. Wait a few minutes
4. Check the session - you should see new decisions/trades appearing

**Test the cron endpoint manually:**
```bash
curl -X GET "https://your-app.vercel.app/api/cron/tick-all-sessions" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

You should see a response like:
```json
{
  "message": "Cron job completed",
  "total": 1,
  "processed": 1,
  "skipped": 0,
  "processedSessions": ["session-id-here"]
}
```

## How It Works

1. **Cron job runs every minute** (configurable)
2. **Fetches all sessions** with `status='running'`
3. **Checks each session's cadence**:
   - Gets cadence from strategy filters (most up-to-date) or session
   - Calculates time since last tick
   - Only ticks if enough time has passed
4. **Calls the tick endpoint** for sessions that need ticking
5. **Sessions tick independently** based on their configured cadence

## Important Notes

- **Client-side ticking still works**: The browser will still tick when you have the page open (for immediate feedback)
- **Server-side is the backup**: When your browser is closed, the server takes over
- **No duplicate ticks**: The system prevents double-ticking by checking `last_tick_at`
- **Respects cadence**: Each session only ticks when its cadence time has passed

## Troubleshooting

### Cron job not running?

1. **Check Vercel logs**: Go to Vercel Dashboard → Your Project → Functions → Cron
2. **Check environment variables**: Make sure `CRON_SECRET` is set
3. **Test manually**: Use the curl command above to test the endpoint
4. **Check session status**: Make sure sessions are actually `status='running'`

### Sessions not ticking?

1. **Check cadence**: Make sure the cadence time has passed since last tick
2. **Check logs**: Look for `[Cron]` messages in your server logs
3. **Verify session status**: Session must be `status='running'`
4. **Check API errors**: The cron endpoint will log any tick failures

### Getting 401 Unauthorized?

- Make sure `CRON_SECRET` matches in both:
  - Your environment variables
  - The Authorization header in your cron service

## Cost Considerations

- **Vercel Cron**: Free tier includes cron jobs
- **External Cron Services**: Most have free tiers (limited runs per day)
- **API Calls**: Each tick makes API calls to your AI provider (normal costs apply)

## Security

- The cron endpoint requires a secret key (`CRON_SECRET`)
- Only internal calls with the correct key can trigger ticks
- User sessions are still validated (can't tick other users' sessions)
