# Debug: Tick Endpoint "Unknown error"

## Current Situation:
- ✅ Cron job is running (GET 200)
- ✅ Found 1 running session
- ✅ Trying to tick session `d8a1ebd2-9951-4ee0-9a79-d517645e0251`
- ❌ Failing with "Unknown error"

## Step 1: Check Tick Endpoint Logs Directly (2 minutes)

1. **In Vercel Logs:**
   - Look for entries with: `/api/sessions/d8a1ebd2-9951-4ee0-9a79-d517645e0251/tick`
   - These are `POST` requests (not GET)
   - Click on one of these entries

2. **Check the log details:**
   - Look for error messages
   - Look for stack traces
   - Look for any clues about what's failing

3. **If you don't see tick endpoint logs:**
   - The tick endpoint might be failing before it can log
   - OR the request isn't reaching the tick endpoint

---

## Step 2: Deploy Improved Error Logging (3 minutes)

The improved error logging I added will show the actual error. Deploy it:

### Option A: Via Vercel Dashboard
1. Go to Vercel → Your project
2. Go to **"Deployments"** tab
3. Click **"..."** on latest deployment
4. Click **"Redeploy"**
5. Wait 2-3 minutes

### Option B: Via Vercel CLI
```bash
cd "/Users/gordon/Desktop/AI Agent"
npx vercel --prod
```

---

## Step 3: Check Your Session Configuration (3 minutes)

While waiting for deployment, check:

1. **Go to your app:**
   - `https://ai-agent-iota-pearl.vercel.app`
   - Sign in

2. **Check the session:**
   - Dashboard → Find session `d8a1ebd2-9951-4ee0-9a79-d517645e0251`
   - Verify:
     - Status is "running" ✅
     - Strategy "Test2" exists
     - Strategy has an API key configured

3. **Check the strategy:**
   - Go to the strategy "Test2"
   - Edit it
   - Verify:
     - API key is filled in
     - Model provider is selected
     - Markets are configured

---

## Step 4: After Deployment - Check Logs Again (2 minutes)

1. **Wait 1-2 minutes** after deployment
2. **Check Vercel Logs:**
   - Look for the latest cron execution
   - You should now see **detailed error messages**

3. **Common errors you might see:**

   **"Session is not running"**
   - Session status changed → Start it again

   **"Virtual account not found"**
   - Session corrupted → Create a new session

   **"Strategy API key missing"**
   - Add API key to strategy

   **"Failed to decrypt API key"**
   - Check CREDENTIALS_ENCRYPTION_KEY in Vercel

   **"No markets configured"**
   - Edit strategy and add markets

   **"Failed to fetch prices"**
   - Hyperliquid API issue → Check connection

---

## Quick Action:

1. **Deploy the improved logging** (Step 2)
2. **Check your session/strategy** (Step 3)
3. **Wait 2-3 minutes**
4. **Check logs again** - you'll see the real error

---

**Most likely issue: Strategy "Test2" is missing an API key. Check that first!**
