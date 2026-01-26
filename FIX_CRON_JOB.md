# Fix Your Cron Job Configuration

## Issues to Fix:

1. **URL has duplicate "http://"** at the end
2. **Authorization field** needs your actual CRON_SECRET
3. **Schedule** should be "Every minute" (not 15 minutes)

## Step-by-Step Fix:

### Step 1: Fix the URL
1. In the **"URL*"** field, you currently have:
   ```
   https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessionshttp://
   ```
2. **Delete the duplicate** `http://` at the end
3. It should be:
   ```
   https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessions
   ```

### Step 2: Add Authorization
1. In the **"Authorization: Bearer YOUR_CRON_SECRET"** field:
2. **Get your CRON_SECRET**:
   - Go to Vercel → Settings → Environment Variables
   - Find `CRON_SECRET`
   - Click the eye icon 👁️ to reveal it
   - Copy the entire value
3. **Paste it** in the Authorization field:
   - Format: `Bearer YOUR_ACTUAL_SECRET_VALUE`
   - Example: `Bearer abc123xyz456...`
   - ⚠️ Make sure "Bearer" is included with a space after it

### Step 3: Change Schedule
1. In **"Execution schedule"** section:
2. Change from **"Every 15 minutes"** to **"Every minute"**
3. The Crontab expression should change to: `* * * * *`

### Step 4: Verify Settings
- ✅ **Title**: (can be anything, e.g., "AI Trading Tick All Sessions")
- ✅ **URL**: `https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessions` (no duplicate http://)
- ✅ **Authorization**: `Bearer YOUR_CRON_SECRET` (with your actual secret)
- ✅ **Enable job**: ON (orange/green)
- ✅ **Execution schedule**: Every minute (`* * * * *`)

### Step 5: Save
1. Scroll to the bottom of the form
2. Click **"Create cronjob"** (or "Save" if editing)
3. Wait for confirmation

### Step 6: Test
1. After saving, click **"Run now"** button
2. Wait a few seconds
3. Check **"Execution history"** - should show success ✅
4. Go to **Vercel → Logs** tab to see if it executed

---

## Quick Checklist:

- [ ] URL fixed (no duplicate http://)
- [ ] Authorization header added with actual CRON_SECRET
- [ ] Schedule changed to "Every minute"
- [ ] Enable job is ON
- [ ] Saved the cron job
- [ ] Tested with "Run now"

Once all checked, your 24/7 trading system is ready! 🚀
