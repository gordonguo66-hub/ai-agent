# Debug: "Unknown error" in Cron Job

## Current Issue:
The cron job is calling the tick endpoint, but getting `{ error: 'Unknown error' }` which means the tick endpoint is failing but not returning a clear error message.

## What I Just Fixed:
I've improved the error logging in the cron job to show:
- HTTP status code
- Full error response
- More detailed error messages

## Next Steps to Debug:

### Step 1: Check the Session Status
1. Go to your app: `https://ai-agent-iota-pearl.vercel.app`
2. Go to Dashboard → Sessions
3. Find session `d8a1ebd2-9951-4ee0-9a79-d517645e0251`
4. Check:
   - Does it exist?
   - What's its status? (should be "running" to tick)
   - Does it have a strategy assigned?

### Step 2: Check Vercel Logs After Next Run
1. Wait for the next cron execution (or trigger it manually in cron-job.org)
2. Check Vercel Logs again
3. You should now see more detailed error information:
   - HTTP status code (e.g., 400, 404, 500)
   - Full error message
   - Response text

### Step 3: Common Issues and Solutions

**If you see HTTP 404:**
- Session doesn't exist → Delete the session or create a new one

**If you see HTTP 400:**
- Session is not in "running" status → Start the session
- Missing required data → Check session configuration

**If you see HTTP 500:**
- Server error → Check if all environment variables are set
- Database error → Check Supabase connection
- Missing API keys → Check strategy has API key configured

**If you see HTTP 401:**
- Authentication issue → Check INTERNAL_API_KEY matches CRON_SECRET

### Step 4: Test with a Fresh Session
1. Create a new trading session
2. Make sure it's in "running" status
3. Wait for cron to tick it
4. Check if it works

---

## Quick Fix:
**The most common cause is the session is not in "running" status.**
- Only sessions with status = "running" will be ticked
- If a session is "stopped" or "paused", it will fail

Check the session status first!
