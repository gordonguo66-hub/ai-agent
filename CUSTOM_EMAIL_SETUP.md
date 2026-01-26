# Custom Email Confirmation Setup

This guide explains how to set up custom email confirmation using your company's email address.

## Overview

The application now supports custom email confirmation instead of relying on Supabase's built-in email system. This allows you to:
- Send emails from your company domain (e.g., `noreply@yourcompany.com`)
- Customize email templates with your branding
- Have full control over email delivery

## Setup Instructions

### 1. Choose an Email Service Provider

We recommend **Resend** (easy setup) or configure SMTP directly. The code currently uses Resend by default.

**Option A: Resend (Recommended)**
1. Go to [resend.com](https://resend.com) and sign up
2. Verify your domain (or use their test domain for development)
3. Get your API key from the dashboard

**Option B: Custom SMTP**
- You can modify `lib/email/resend.ts` to use Nodemailer or another SMTP library
- Configure SMTP settings in environment variables

### 2. Environment Variables

Add these to your `.env.local` file:

```bash
# Email Configuration (Required for custom emails)
RESEND_API_KEY=re_xxxxxxxxxxxxx  # Get from Resend dashboard

# Email Sender (Optional - defaults shown)
EMAIL_FROM=noreply@yourcompany.com
# Or with name: AI Arena Trade <noreply@yourcompany.com>

# App URL (Required for confirmation links)
NEXT_PUBLIC_APP_URL=https://yourdomain.com
# For local development: http://localhost:3000

# Enable Custom Email Confirmation (set to "true" to enable)
NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true
```

### 3. Disable Supabase Email Confirmation

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers** → **Email**
3. **Disable** "Enable email confirmations" (turn it off)
4. Save changes

This prevents Supabase from sending its own confirmation emails.

### 4. Verify Domain (Production)

For production, you need to verify your sending domain:

**Resend:**
1. Go to Resend dashboard → Domains
2. Add your domain (e.g., `yourcompany.com`)
3. Add the DNS records they provide
4. Wait for verification (usually a few minutes)
5. Update `EMAIL_FROM` to use your verified domain

### 5. Test the Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables in `.env.local`

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Try signing up with a new account
5. Check the email inbox for the confirmation email
6. Click the confirmation link
7. You should be redirected to the sign-in page with a success message

## Email Template Customization

To customize the email template, edit:
- `lib/email/templates.ts` - Modify the `sendConfirmationEmail` function
- The HTML template is inline - you can style it however you want
- Company logo, colors, and branding can be added

## How It Works

1. **Sign Up**: User creates account → Account created in Supabase (unconfirmed)
2. **Email Sent**: Custom confirmation email sent via Resend with unique token
3. **User Clicks Link**: Token verified → Email confirmed in Supabase
4. **Sign In**: User can now sign in normally

## Troubleshooting

### Emails not being sent
- Check `RESEND_API_KEY` is set correctly
- Verify domain is verified (for production)
- Check Resend dashboard for delivery logs
- Check browser console for errors

### Confirmation link not working
- Verify `NEXT_PUBLIC_APP_URL` matches your actual domain
- Check that the token hasn't expired (24 hours)
- Ensure Supabase email confirmation is disabled

### Still receiving Supabase emails
- Double-check Supabase email confirmation is disabled
- Clear browser cache
- Verify `NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true`

## Production Checklist

- [ ] Domain verified in Resend (or SMTP configured)
- [ ] `EMAIL_FROM` uses verified domain
- [ ] `NEXT_PUBLIC_APP_URL` set to production domain
- [ ] `NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true`
- [ ] Supabase email confirmation disabled
- [ ] Email template customized with your branding
- [ ] Tested signup flow end-to-end

## Future Enhancements

You can extend this system to:
- Password reset emails
- Welcome emails after confirmation
- Transactional emails
- Email notifications for trading activities
