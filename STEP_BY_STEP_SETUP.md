# Complete Step-by-Step Setup Guide

## Part 1: Fix the 500 Error (Add Missing Environment Variables)

### Step 1: Get Your Supabase Credentials

1. Open a new browser tab
2. Go to https://supabase.com
3. Sign in to your account
4. Click on your project (or create one if you don't have one)
5. In the left sidebar, click **"Project Settings"** (gear icon at the bottom)
6. Click **"API"** in the settings menu
7. You'll see three important values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
   - **service_role** key (long string starting with `eyJ...` - click "Reveal" to see it)
8. **Keep this tab open** - you'll need to copy these values

### Step 2: Add Environment Variables to Vercel

1. Go back to your Vercel tab (or open https://vercel.com)
2. Navigate to: **Your Project → Settings → Environment Variables**
3. You should see the 3 variables you already added:
   - `NEXT_PUBLIC_APP_URL`
   - `INTERNAL_API_KEY`
   - `CRON_SECRET`

4. **Add the first missing variable:**
   - Click **"Add Environment Variable"** button
   - **Key**: `NEXT_PUBLIC_SUPABASE_URL`
   - **Value**: Paste the **Project URL** from Supabase (Step 1, item 1)
   - **Environment**: Select **"All Environments"** (Production, Preview, Development)
   - Click **"Save"**

5. **Add the second missing variable:**
   - Click **"Add Environment Variable"** again
   - **Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Value**: Paste the **anon public** key from Supabase (Step 1, item 2)
   - **Environment**: Select **"All Environments"**
   - Click **"Save"**

6. **Add the third missing variable:**
   - Click **"Add Environment Variable"** again
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Paste the **service_role** key from Supabase (Step 1, item 3)
   - **Environment**: Select **"All Environments"**
   - Click **"Save"**

7. **Add the fourth variable (if you have it):**
   - Check your local `.env.local` file for `CREDENTIALS_ENCRYPTION_KEY`
   - If it exists, add it:
     - Click **"Add Environment Variable"**
     - **Key**: `CREDENTIALS_ENCRYPTION_KEY`
     - **Value**: Copy from your `.env.local` file
     - **Environment**: Select **"All Environments"**
     - Click **"Save"**

### Step 3: Redeploy Your App

1. In Vercel, go to the **"Deployments"** tab (top navigation)
2. Find the latest deployment (should be at the top)
3. Click the **"..."** (three dots) menu on the right side of that deployment
4. Click **"Redeploy"**
5. A popup will appear - click **"Redeploy"** again
6. Wait 2-3 minutes for the deployment to complete
7. You'll see a notification when it's done

### Step 4: Verify the Fix

1. Once deployment is complete, click on the deployment
2. Click the **"Visit"** button (or the domain link)
3. The app should load without the 500 error
4. You should see your login/auth page

---

## Part 2: Set Up 24/7 Cron Job

### Step 5: Get Your Vercel Domain

1. In Vercel, go to **"Deployments"** tab
2. Click on the latest deployment
3. Under **"Domains"** section, you'll see:
   - `ai-agent-iota-pearl.vercel.app` (this is your main domain)
4. **Copy this domain** - you'll need it for the cron job

### Step 6: Get Your CRON_SECRET Value

1. In Vercel, go to **Settings → Environment Variables**
2. Find `CRON_SECRET` in the list
3. Click the **eye icon** 👁️ next to it to reveal the value
4. **Copy the entire value** (it's a long string)
5. Keep this copied - you'll need it in the next step

### Step 7: Set Up cron-job.org

1. Open a new browser tab
2. Go to https://cron-job.org
3. **Sign up** for a free account (or sign in if you have one)
4. After signing in, you'll see the dashboard
5. Click **"Create cronjob"** button (usually a big button in the center or top right)

### Step 8: Configure the Cron Job

Fill out the form:

1. **Title**: 
   - Type: `AI Trading Tick All Sessions`

2. **Address (URL)**:
   - Paste: `https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessions`
   - ⚠️ Replace `ai-agent-iota-pearl.vercel.app` with YOUR actual domain from Step 5

3. **Request Method**:
   - Select: `GET`

4. **Add Authorization Header**:
   - Look for a section called **"Authorization"** or **"Request Headers"**
   - Click to expand or add a header
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer YOUR_CRON_SECRET_VALUE`
     - Replace `YOUR_CRON_SECRET_VALUE` with the actual value you copied in Step 6
     - Example: `Bearer abc123xyz456...` (with the word "Bearer" and a space before your secret)

5. **Execution schedule**:
   - Select: **"Every minute"** (or `* * * * *`)
   - This will tick your sessions every minute

6. **Enable job**:
   - Make sure the toggle is **ON** (orange/green)

7. **Schedule expires**:
   - Leave this **OFF** (so it runs forever)

8. Click **"Create cronjob"** button at the bottom

### Step 9: Test the Cron Job

1. After creating, you'll see your cron job in the list
2. Click on it to open details
3. Click **"Run now"** button to test it immediately
4. Wait a few seconds
5. Check the **"Execution history"** or **"Logs"** section
6. You should see a successful execution (green checkmark)

### Step 10: Verify It's Working in Vercel

1. Go back to Vercel
2. Click **"Logs"** tab in your project
3. You should see logs from the cron job execution
4. Look for lines like:
   ```
   [Cron] Processing X sessions that need ticking
   [Cron] ✅ Successfully ticked session abc-123
   ```

---

## Part 3: Final Verification

### Step 11: Test the Full System

1. Go to your deployed app (click "Visit" in Vercel)
2. Sign in to your account
3. Create or start a trading session
4. **Close your browser** (or close the tab)
5. Wait 5-10 minutes
6. **Reopen** your app and check the session
7. You should see new decisions/trades appearing automatically!

---

## Troubleshooting

**If you still see 500 error after Step 4:**
- Double-check all environment variables are added correctly
- Make sure values are copied exactly (no extra spaces)
- Check Vercel logs for specific error messages

**If cron job fails:**
- Verify the URL is correct (no typos)
- Check the Authorization header format: `Bearer YOUR_SECRET` (with space)
- Make sure `CRON_SECRET` in Vercel matches what you put in cron-job.org
- Check Vercel logs for errors

**If sessions aren't ticking:**
- Verify cron job shows successful executions in cron-job.org
- Check that session status is "running"
- Verify session cadence is set correctly in your strategy

---

**You're all set! Your trading system is now running 24/7! 🚀**
