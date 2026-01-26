# Quick Email Setup (Option 1 - Test Domain)

Get started with custom email confirmation in 5 minutes!

## Step 1: Get Resend API Key (2 minutes)

1. Go to [resend.com](https://resend.com)
2. Click "Sign Up" (free account)
3. After signing up, go to **API Keys** in the dashboard
4. Click **"Create API Key"**
5. Give it a name (e.g., "AI Arena Trade")
6. Copy the API key (starts with `re_`)

## Step 2: Add to Environment Variables (1 minute)

Add these lines to your `.env.local` file:

```bash
# Resend API Key (from Step 1)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Use Resend's test domain (works immediately, no setup needed)
EMAIL_FROM=onboarding@resend.dev

# Your app URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Enable custom email confirmation
NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true
```

**Important:** Replace `re_xxxxxxxxxxxxx` with your actual API key from Resend!

## Step 3: Install Dependencies (if not done)

```bash
npm install
```

## Step 4: Restart Your Dev Server

```bash
npm run dev
```

## Step 5: Test It!

1. Go to `http://localhost:3000/auth`
2. Click "Sign Up" tab
3. Enter email, username, and password
4. Click "Sign Up"
5. Check your email inbox for a confirmation email from `onboarding@resend.dev`
6. Click the confirmation link
7. You should be redirected to sign in with a success message!

## Troubleshooting

### "Email service not configured" error
- Check that `RESEND_API_KEY` is set correctly in `.env.local`
- Make sure you restarted the dev server after adding the env variable
- Verify the API key starts with `re_`

### Email not received
- Check spam/junk folder
- Verify email address is correct
- Check Resend dashboard → Emails to see delivery status
- Try a different email address

### Still using auto-login instead of email
- Make sure `NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true` is set
- Hard refresh the page (Cmd + Shift + R)
- Check browser console for errors

## What Happens Now

- ✅ Emails sent from `onboarding@resend.dev`
- ✅ Professional branded email template
- ✅ Users must confirm email before signing in
- ✅ Works for testing and development

## Next Steps (When Ready for Production)

When you're ready to launch:
1. Get your own domain (`yourcompany.com`)
2. Verify it in Resend dashboard
3. Change `EMAIL_FROM=noreply@yourcompany.com`
4. Done!

But for now, you're all set to test! 🎉
