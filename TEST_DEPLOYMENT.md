# Test Your Deployment

## ✅ Step 1: Test if 500 Error is Fixed

1. **Click on the domain**: `ai-agent-iota-pearl.vercel.app` (or click "Visit" button)
2. The app should load without the 500 error
3. You should see your login/auth page

**If you still see 500 error:**
- Go back to Vercel → Settings → Environment Variables
- Verify all 3 Supabase variables are added:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- If missing, add them and redeploy

**If the app loads successfully:**
- ✅ Great! The 500 error is fixed
- Proceed to Step 2

---

## ⏰ Step 2: Set Up Cron Job (5 minutes)

### Get Your Domain
- Your domain is: **`ai-agent-iota-pearl.vercel.app`**

### Get Your CRON_SECRET
1. In Vercel → Settings → Environment Variables
2. Find `CRON_SECRET`
3. Click the eye icon 👁️ to reveal it
4. Copy the entire value

### Set Up cron-job.org

1. **Go to**: https://cron-job.org
2. **Sign up** (free account)
3. **Click**: "Create cronjob"

4. **Fill out the form:**
   - **Title**: `AI Trading Tick All Sessions`
   - **Address (URL)**: 
     ```
     https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessions
     ```
   - **Request Method**: `GET`
   - **Add Header**:
     - **Name**: `Authorization`
     - **Value**: `Bearer YOUR_CRON_SECRET_VALUE`
       - Replace `YOUR_CRON_SECRET_VALUE` with the actual value you copied
       - Example: `Bearer abc123xyz456...`
   - **Execution schedule**: Every minute (`* * * * *`)
   - **Enable job**: ON (toggle should be orange/green)
   - **Schedule expires**: OFF

5. **Click**: "Create cronjob"

6. **Test it**:
   - Click "Run now" button
   - Wait a few seconds
   - Check "Execution history" - should show success ✅

---

## ✅ Step 3: Verify Cron Job is Working

1. **In Vercel**: Go to **"Logs"** tab
2. **In cron-job.org**: Click "Run now" again
3. **Check Vercel Logs**: You should see:
   ```
   [Cron] Processing X sessions that need ticking
   [Cron] ✅ Successfully ticked session abc-123
   ```

---

## 🎉 Step 4: Final Test

1. **Go to your app**: `https://ai-agent-iota-pearl.vercel.app`
2. **Sign in**
3. **Create or start a trading session**
4. **Close your browser** (or tab)
5. **Wait 5-10 minutes**
6. **Reopen** your app and check the session
7. **You should see new decisions/trades appearing automatically!**

---

## 📝 Summary

✅ **Deployment**: Ready and working  
⏰ **Next**: Set up cron-job.org  
🎯 **Goal**: 24/7 autonomous trading

Your domain for cron job: `ai-agent-iota-pearl.vercel.app`
