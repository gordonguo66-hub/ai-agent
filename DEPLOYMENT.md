# Deployment Guide

## Deploying to Vercel

### Prerequisites

1. A Vercel account ([vercel.com](https://vercel.com))
2. A Supabase project with database set up
3. Your encryption key generated

### Step 1: Generate Encryption Key

Before deploying, generate a secure encryption key:

```bash
node generate-key.js
```

**Save this key securely!** You'll need it for the environment variables.

### Step 2: Push to GitHub

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### Step 3: Import Project in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Click "Add" to import the project

### Step 4: Configure Environment Variables

In Vercel project settings, add these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CREDENTIALS_ENCRYPTION_KEY=your_generated_key
```

**⚠️ CRITICAL: You MUST set `CREDENTIALS_ENCRYPTION_KEY` or users will not be able to use saved API keys!**

### Step 5: Deploy

Click "Deploy" and wait for the build to complete.

### Step 6: Verify Deployment

1. Visit your deployment URL
2. Check the Vercel Function Logs for the startup message:
   - ✅ `CREDENTIALS_ENCRYPTION_KEY is configured` (good!)
   - ⚠️ `CREDENTIALS_ENCRYPTION_KEY is NOT set!` (fix this!)

## Environment Variables Reference

### Required Variables

| Variable | Description | How to Get |
|----------|-------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase Dashboard → Settings → API |
| `CREDENTIALS_ENCRYPTION_KEY` | 32-byte encryption key | Run `node generate-key.js` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Your app's public URL | Auto-detected |

## Post-Deployment Checklist

- [ ] All environment variables are set in Vercel
- [ ] Database schema is applied in Supabase
- [ ] Authentication is working (test sign up/sign in)
- [ ] Can create strategies
- [ ] Can start sessions
- [ ] Check Vercel Function Logs for errors

## Common Deployment Issues

### "CREDENTIALS_ENCRYPTION_KEY not configured"

**Problem:** Users see "Server configuration error" when trying to trade.

**Solution:** 
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `CREDENTIALS_ENCRYPTION_KEY` with your generated key
3. Redeploy the project

### Build Failures

**Problem:** Build fails during deployment.

**Solution:**
1. Check the build logs in Vercel
2. Ensure all dependencies are in `package.json`
3. Try `npm run build` locally to reproduce the error

### Database Connection Errors

**Problem:** "Unauthorized" or database errors in production.

**Solution:**
1. Verify all Supabase environment variables are correct
2. Check that database schema is applied
3. Ensure RLS policies are configured correctly

## Updating Environment Variables

If you need to change an environment variable:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Edit or add the variable
3. **Important:** Redeploy for changes to take effect
   - Go to Deployments → ... menu → Redeploy

## Backup Your Encryption Key

**⚠️ CRITICAL WARNING:**

- If you lose your `CREDENTIALS_ENCRYPTION_KEY`, all encrypted API keys become unrecoverable
- Store it in a secure password manager
- Consider storing it in multiple secure locations
- Document where it's stored for your team

## Security Best Practices

1. **Never commit** `.env.local` or encryption keys to git
2. **Rotate keys** periodically (requires migrating encrypted data)
3. **Use different keys** for development and production
4. **Limit access** to Vercel project settings
5. **Enable 2FA** on your Vercel account

## Monitoring

After deployment, monitor:

1. **Vercel Function Logs** - Check for errors
2. **Supabase Dashboard** - Monitor database queries
3. **User Reports** - Watch for issues with trading sessions

## Need Help?

- Check server logs in Vercel Dashboard → Your Project → Functions
- Review Supabase logs in Supabase Dashboard → Logs
- Ensure environment variables are set correctly
