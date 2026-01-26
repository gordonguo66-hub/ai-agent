# Next Steps: Complete 24/7 Setup

## ✅ Step 1: Environment Variables (DONE)
You've already added:
- `NEXT_PUBLIC_APP_URL`
- `INTERNAL_API_KEY`
- `CRON_SECRET`

## 🔄 Step 2: Redeploy Your App

**In Vercel Dashboard:**
1. Click the **"Redeploy"** button in the notification (or go to Deployments tab)
2. Select the latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete (~2-3 minutes)

**OR via Terminal:**
```bash
cd "/Users/gordon/Desktop/AI Agent"
git add .
git commit -m "Add scalability optimizations"
git push
# Vercel will auto-deploy
```

## ⏰ Step 3: Set Up External Cron Service

Since Vercel Hobby plan only supports daily cron jobs, we need an external service:

### Option A: cron-job.org (Recommended - Free)

1. **Sign up**: Go to https://cron-job.org and create a free account

2. **Create New Cron Job**:
   - Click **"Create cronjob"**
   - **Title**: "AI Trading Tick All Sessions"
   - **Address (URL)**: `https://ai-agent.vercel.app/api/cron/tick-all-sessions`
     - ⚠️ Replace `ai-agent.vercel.app` with your actual Vercel domain!
   - **Schedule**: Every minute (`* * * * *`)
   - **Request Method**: `GET`
   - **Request Headers**: Click "Add Header"
     - **Name**: `Authorization`
     - **Value**: `Bearer YOUR_CRON_SECRET_VALUE`
       - ⚠️ Replace `YOUR_CRON_SECRET_VALUE` with the actual value from Vercel!
       - To see the value: In Vercel → Settings → Environment Variables → Click the eye icon next to `CRON_SECRET`
   - **Activate**: Toggle ON
   - Click **"Create cronjob"**

3. **Test the Cron Job**:
   - After creating, click **"Run now"** to test
   - Check Vercel logs to see if it worked

### Option B: EasyCron (Alternative)

1. Sign up at https://www.easycron.com
2. Create cron job with same settings as above

## ✅ Step 4: Verify It's Working

### Test 1: Manual Endpoint Test
```bash
# Replace with your actual values
curl -X GET "https://ai-agent.vercel.app/api/cron/tick-all-sessions" \
  -H "Authorization: Bearer YOUR_CRON_SECRET_VALUE"
```

You should see:
```json
{
  "message": "Cron job completed",
  "total": 0,
  "processed": 0,
  "skipped": 0,
  "processedSessions": []
}
```

### Test 2: Start a Trading Session
1. Go to your app
2. Create/start a trading session
3. Close your browser
4. Wait 5-10 minutes
5. Reopen and check the session - you should see new decisions/trades!

### Test 3: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → **Logs** tab
2. You should see cron job logs every minute:
   ```
   [Cron] Processing X sessions that need ticking
   [Cron] ✅ Successfully ticked session abc-123
   ```

## 🔍 Troubleshooting

**Cron job not running?**
- Check cron-job.org shows "Last execution: X minutes ago"
- Verify the URL is correct (no typos)
- Verify the Authorization header value matches your `CRON_SECRET`
- Check Vercel logs for errors

**Sessions not ticking?**
- Verify session status is "running"
- Check session cadence (should tick every X seconds based on strategy)
- Check Vercel logs for specific errors

**Getting 401 Unauthorized?**
- Verify `CRON_SECRET` in Vercel matches the header value in cron-job.org
- Make sure header format is exactly: `Bearer YOUR_SECRET` (with space)

## 📊 Monitor Performance

Once running, you can monitor:
- **Vercel Analytics**: See API call volumes
- **Supabase Dashboard**: Monitor database query performance
- **cron-job.org**: See execution history and success rate

---

**Your app is now running 24/7! 🚀**
