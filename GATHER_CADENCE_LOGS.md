# Step-by-Step Guide to Gather Cadence Diagnostic Info

## What We Need
We need to see the **cron job logs** to understand why decisions are happening 2 minutes apart instead of 1 minute.

## Step 1: Find Your Server Terminal

1. **Look for your terminal window** where you ran `npm run dev`
2. **OR** check if the server is running in the background

## Step 2: Wait for Cron to Run

Your cron job should run every 1 minute (based on your cron-job.org setup).

**Wait for the next cron execution** (happens every minute on the minute).

## Step 3: Copy the Cron Logs

When cron runs, you'll see log messages in your server terminal. Look for lines containing:

- `[Cron]` 
- `cadence`
- `tick`
- `Session`

**You need to copy and paste these specific log entries:**

1. The log that shows the cadence check:
   ```
   [Cron] 📊 Session {id} cadence check: { ... }
   ```

2. The log that shows whether it ticks or skips:
   ```
   [Cron] ✅ Session {id} needs ticking: { ... }
   ```
   OR
   ```
   [Cron] ⏭️ Session {id} skipping: { ... }
   ```

## Step 4: Also Check Tick API Logs

Look for logs from the tick endpoint (when a tick actually executes):
- `[Tick] ⏰ Starting tick at ...`
- `[Tick API] ✅ Updated last_tick_at to ...`

## What Information We're Looking For

From the logs, we need to see:
1. ✅ **What cadence value is being used** (`cadenceSeconds: 60` or something else?)
2. ✅ **What `last_tick_at` timestamp is being read** (is it correct?)
3. ✅ **What `timeSinceLastTickSeconds` is calculated** (should be ~60 for 1 minute)
4. ✅ **Whether it ticks or skips** (and why)

## Alternative: Check Server Logs File

If your server is running in the background, check:

```bash
# Check if there's a log file
tail -100 /tmp/dev-server.log
```

Or check your terminal history for recent cron executions.

## Step 5: Share the Logs

Once you have the cron logs, **copy and paste them here** in your next message.

---

**Quick Check:** If you can't find the logs, let me know and I'll help you:
- Enable more detailed logging
- Set up a log file
- Or check logs another way
