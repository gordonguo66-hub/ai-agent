# Step-by-Step: Fix "Unknown error" in Cron Job

## Step 1: Check Your Session Status (2 minutes)

1. **Open your app:**
   - Go to: `https://ai-agent-iota-pearl.vercel.app`
   - Sign in if needed

2. **Go to Sessions:**
   - Click **"Dashboard"** in the navigation
   - You should see a list of your trading sessions

3. **Find the failing session:**
   - Look for session ID: `d8a1ebd2-9951-4ee0-9a79-d517645e0251`
   - OR just check all your sessions

4. **Check the status:**
   - Look at the "Status" column for each session
   - Is it "running", "stopped", or "paused"?

5. **What to do based on status:**
   - **If "stopped" or "paused":**
     - This is why it's failing (normal behavior)
     - Either start it (click "Start Session") OR ignore the error
   - **If "running":**
     - Continue to Step 2

---

## Step 2: Deploy Improved Error Logging (3 minutes)

1. **Go to your project folder:**
   ```bash
   cd "/Users/gordon/Desktop/AI Agent"
   ```

2. **Commit and push the changes:**
   ```bash
   git add .
   git commit -m "Improve cron error logging"
   git push
   ```

3. **Wait for Vercel to deploy:**
   - Go to Vercel → Deployments tab
   - Wait 2-3 minutes for new deployment
   - You'll see a new deployment appear

---

## Step 3: Test with a Fresh Session (5 minutes)

1. **Create a new session:**
   - In your app, go to Dashboard
   - Click on a strategy
   - Click **"Start Session"** (or "Start Virtual")
   - Make sure status shows **"running"**

2. **Wait for cron to tick:**
   - Wait 1-2 minutes (cron runs every minute)
   - OR manually trigger it in cron-job.org:
     - Go to cron-job.org
     - Find your cron job
     - Click **"Run now"**

3. **Check Vercel logs:**
   - Go to Vercel → Your project → **"Logs"** tab
   - Look for the latest cron execution
   - You should see either:
     - ✅ `Successfully ticked session` (good!)
     - ❌ More detailed error message (will tell us what's wrong)

---

## Step 4: Read the Error Message (2 minutes)

**If you see an error, check what it says:**

### Error: "Session not found" or HTTP 404
- **Cause:** Session was deleted
- **Fix:** Ignore it, or create a new session

### Error: "Session is not running" or HTTP 400
- **Cause:** Session status is not "running"
- **Fix:** Start the session in your app

### Error: "Missing API key" or "Failed to decrypt"
- **Cause:** Strategy doesn't have API key configured
- **Fix:** 
  1. Go to your strategy
  2. Edit it
  3. Add your AI provider API key
  4. Save

### Error: "Exchange connection not found" (for live mode)
- **Cause:** No Hyperliquid account connected
- **Fix:** Connect your Hyperliquid account in Settings

### Error: HTTP 500 or "Internal server error"
- **Cause:** Server configuration issue
- **Fix:** Check all environment variables are set in Vercel

---

## Step 5: Verify It's Working (2 minutes)

1. **Create a test session:**
   - Create a new trading session
   - Make sure it's **"running"**
   - Make sure the strategy has an API key configured

2. **Wait 2-3 minutes**

3. **Check the session:**
   - Go to the session detail page
   - You should see:
     - New decisions appearing
     - Trades being executed
     - Equity curve updating

4. **Check Vercel logs:**
   - Should show: `✅ Successfully ticked session`

---

## Quick Summary:

1. ✅ Check session status (should be "running")
2. ✅ Deploy improved logging (optional, but helpful)
3. ✅ Test with a fresh "running" session
4. ✅ Read error message if it fails
5. ✅ Fix based on error type

---

## Most Common Fix:

**If the session is "stopped" or "paused":**
- Just start it! Click "Start Session" in your app
- Then wait 1-2 minutes and check logs again

**If the session is already "running" and still failing:**
- Check the strategy has an API key configured
- Check all environment variables are set in Vercel
- The improved error logging will show the exact issue

---

**Start with Step 1 - check your session status first!**
