# 🚀 Production Deployment Checklist

## Before You Deploy

### ✅ Step 1: Run Locally First

```bash
npm install
npm run dev
```

The encryption key will be **automatically generated** and saved to `.env.local`!

✅ Check server logs for: `✅ CREDENTIALS_ENCRYPTION_KEY is configured`

✅ Test that sessions work (no decryption errors)

### ✅ Step 2: Get Your Encryption Key for Production

**Option A: Copy from .env.local**

Open `.env.local` and copy the `CREDENTIALS_ENCRYPTION_KEY` value.

**Option B: Generate a new key for production**

```bash
node generate-key.js
```

**⚠️ SAVE IT SECURELY:**
1. Password manager (1Password, LastPass, etc.)
2. Team documentation
3. Backup location

**⚠️ IF YOU LOSE THIS KEY, ALL ENCRYPTED API KEYS ARE PERMANENTLY LOST!**

---

## Deployment Steps

### 3. Set Environment Variables in Vercel

Go to: **Vercel Dashboard → Your Project → Settings → Environment Variables**

Add these 4 variables (copy from your `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=<from .env.local>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from .env.local>
SUPABASE_SERVICE_ROLE_KEY=<from .env.local>
CREDENTIALS_ENCRYPTION_KEY=<from .env.local or generate-key.js>
```

### 4. Push and Deploy

```bash
git add .
git commit -m "Ready for production"
git push
```

Vercel will auto-deploy, or click "Deploy" in the dashboard.

### 5. Verify Production

After deployment:

1. Check Vercel Function Logs for: `✅ CREDENTIALS_ENCRYPTION_KEY is configured`
2. Test creating a new strategy
3. Test starting a session
4. Check that decisions appear without errors

---

## What We Fixed

### ✅ Better Error Messages

**Before:**
```
Error: Failed to decrypt saved API key: CREDENTIALS_ENCRYPTION_KEY not configured for decrypt
```

**After:**
```
Server configuration error: Encryption key is not set up. 
The administrator needs to configure CREDENTIALS_ENCRYPTION_KEY in environment variables.
Contact support or check the server logs for setup instructions.
```

### ✅ Startup Warning System

When the server starts, you'll see:

**If key is missing:**
```
⚠️  ========================================
⚠️  CREDENTIALS_ENCRYPTION_KEY is NOT set!
⚠️  ========================================
```

**If key is configured:**
```
✅ CREDENTIALS_ENCRYPTION_KEY is configured
```

### ✅ Documentation Added

- `DEPLOYMENT.md` - Complete Vercel deployment guide
- `PRODUCTION_CHECKLIST.md` - This file!
- `SETUP.md` - Updated with encryption key instructions
- `README.md` - Links to deployment docs
- `generate-key.js` - Pretty key generator script

---

## Common Issues & Solutions

### Issue: "Server configuration error" in production

**Cause:** `CREDENTIALS_ENCRYPTION_KEY` not set in Vercel

**Solution:**
1. Go to Vercel → Settings → Environment Variables
2. Add `CREDENTIALS_ENCRYPTION_KEY` with your key
3. Redeploy (Deployments → ... → Redeploy)

### Issue: Old sessions still have errors

**Cause:** Those sessions were created when the key was missing

**Solution:** 
- Start a new session - it will work fine
- Old sessions with errors can be safely deleted

### Issue: Build fails in Vercel

**Cause:** Missing environment variables during build

**Solution:**
- Ensure all 4 environment variables are set
- Try deploying again

---

## Security Reminders

1. **Never commit** `.env.local` to git
2. **Backup your key** in multiple secure locations
3. **Use different keys** for dev and production (optional but recommended)
4. **Limit access** to Vercel project settings

---

## Need Help?

Check logs in:
- **Vercel:** Dashboard → Your Project → Functions → Logs
- **Supabase:** Dashboard → Logs Explorer

If you see the warning about missing encryption key, add it to your environment variables and redeploy.

---

## Summary

✅ Run `npm run dev` (key auto-generates!)  
✅ Test locally  
✅ Copy key from `.env.local` (or generate a new one)  
✅ Save key securely  
✅ Add to Vercel environment variables  
✅ Push and deploy  
✅ Verify production  

**You're ready to deploy! 🚀**

## Why Auto-Generate?

- **Development:** Key auto-generates so you can start coding immediately
- **Production:** You must manually set it to ensure you've backed it up securely
- **Security:** Forces conscious setup for production deployments
