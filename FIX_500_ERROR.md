# Fix 500 Error: Missing Environment Variables

## Problem
The deployment shows `500: INTERNAL_SERVER_ERROR` with `MIDDLEWARE_INVOCATION_FAILED` because the middleware needs Supabase credentials that aren't set in Vercel.

## Solution: Add Missing Environment Variables

Go to **Vercel → Settings → Environment Variables** and add these:

### Required Supabase Variables:

1. **`NEXT_PUBLIC_SUPABASE_URL`**
   - Value: Your Supabase project URL
   - Get it from: Supabase Dashboard → Project Settings → API → Project URL
   - Example: `https://xxxxx.supabase.co`

2. **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
   - Value: Your Supabase anon/public key
   - Get it from: Supabase Dashboard → Project Settings → API → anon/public key
   - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

3. **`SUPABASE_SERVICE_ROLE_KEY`**
   - Value: Your Supabase service role key (keep secret!)
   - Get it from: Supabase Dashboard → Project Settings → API → service_role key
   - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - ⚠️ Make sure this is set for "All Environments"

4. **`CREDENTIALS_ENCRYPTION_KEY`** (if you're using encryption)
   - Value: Your 32-byte encryption key (base64 or hex)
   - This should match what you have in `.env.local`

### Already Added (Keep These):
- ✅ `NEXT_PUBLIC_APP_URL`
- ✅ `INTERNAL_API_KEY`
- ✅ `CRON_SECRET`

## Steps:

1. Go to **Vercel Dashboard → Your Project → Settings → Environment Variables**
2. Click **"Add Environment Variable"** for each missing one above
3. Set them for **"All Environments"**
4. After adding all, **Redeploy** your app (or push new code)

## After Adding Variables:

1. Go to **Deployments** tab
2. Click the **"..."** menu on the latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete
5. Check if the error is fixed

## Verify It's Working:

1. Click **"Visit"** button on the deployment
2. The app should load without the 500 error
3. You should see the login/auth page

---

**Once fixed, you can proceed with the cron-job.org setup using your domain:**
- `ai-agent-iota-pearl.vercel.app`
