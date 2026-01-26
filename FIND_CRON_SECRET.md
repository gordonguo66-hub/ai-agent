# How to Find or Add CRON_SECRET in Vercel

## The Issue:
You're currently on the **Team-level** Environment Variables page (shared variables). `CRON_SECRET` needs to be at the **Project-level**.

## Solution: Go to Project-Level Environment Variables

### Step 1: Navigate to Your Project
1. In Vercel, make sure you're viewing your **specific project** (not the team dashboard)
2. Click on **"ai-agent"** project (or your project name)

### Step 2: Go to Project Settings
1. Once in your project, click **"Settings"** in the top navigation
2. In the left sidebar, click **"Environment Variables"** (under the project settings, not team settings)

### Step 3: Check if CRON_SECRET Exists
1. You should see a list of environment variables
2. Look for `CRON_SECRET` in the list
3. If you see it:
   - Click the **eye icon** 👁️ next to it to reveal the value
   - Copy the entire value
4. If you DON'T see it:
   - You need to add it (see Step 4)

### Step 4: Add CRON_SECRET (if missing)
1. Click **"Add Environment Variable"** button
2. **Key**: `CRON_SECRET`
3. **Value**: Generate a secure random string:
   - Option A: Use this command in terminal:
     ```bash
     openssl rand -hex 32
     ```
   - Option B: Use any random string generator (minimum 32 characters)
   - Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`
4. **Environment**: Select **"All Environments"**
5. Click **"Save"**

### Step 5: Get the Value
1. After adding (or if it already exists), find `CRON_SECRET` in the list
2. Click the **eye icon** 👁️ next to it
3. **Copy the entire value** (it's a long string)
4. Use this in cron-job.org: `Bearer YOUR_COPIED_VALUE`

---

## Quick Navigation Path:
```
Vercel Dashboard → Your Project (ai-agent) → Settings → Environment Variables
```

NOT:
```
Vercel Dashboard → Team Settings → Environment Variables (this is for shared variables)
```

---

## If You Still Can't Find It:
1. Make sure you're in the **project view** (not team view)
2. Check the URL - it should be: `vercel.com/.../ai-agent/.../settings/environment-variables`
3. If the list is empty, you need to add all required variables:
   - `CRON_SECRET`
   - `INTERNAL_API_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
