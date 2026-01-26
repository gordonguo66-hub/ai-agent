# How to Find Your Vercel Domain

## Method 1: View Deployment Button (Fastest)
1. Look for the **"Deployment created"** notification (bottom right)
2. Click **"View Deployment"**
3. The URL in your browser is your Vercel domain
4. Copy it (e.g., `https://ai-agent-abc123.vercel.app`)

## Method 2: Domains Section (Most Complete)
1. In the left sidebar, click **"Domains"**
2. You'll see all domains for your project:
   - Default: `ai-agent-xxxxx.vercel.app`
   - Custom domains (if any)
3. Copy the default `.vercel.app` domain

## Method 3: Deployments Tab
1. Click **"Deployments"** in the top navigation
2. Click on the latest deployment
3. The URL shown is your domain

## Method 4: Project Overview
1. Go to **"Overview"** tab
2. Look at the **"Domains"** section
3. Your domain is listed there

---

**Your domain format will be:**
- `https://ai-agent-xxxxx.vercel.app` (default)
- OR `https://ai-agent.vercel.app` (if you set a custom name)

**Use this in cron-job.org:**
- URL: `https://YOUR-DOMAIN-HERE.vercel.app/api/cron/tick-all-sessions`
