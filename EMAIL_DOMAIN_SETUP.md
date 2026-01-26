# Email Domain Setup Guide

## Do You Need Your Own Domain?

**For Testing/Development: NO** - You can use Resend's test domain right away  
**For Production: YES** - You need to verify your own domain

## Quick Start (Testing - No Domain Needed)

You can start sending emails immediately using Resend's test domain:

1. **Sign up for Resend** at [resend.com](https://resend.com) (free tier available)
2. **Get your API key** from the dashboard
3. **Add to `.env.local`**:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   EMAIL_FROM=onboarding@resend.dev  # Resend's test domain
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true
   ```
4. **Start sending emails!** Emails will come from `onboarding@resend.dev`

**Note:** Test domain emails may go to spam folders, and it's only for development.

## Production Setup (Your Own Domain)

When you're ready for production, you'll need:

### Step 1: Get a Domain
- Purchase a domain (e.g., `yourcompany.com`) from:
  - Namecheap
  - Google Domains
  - GoDaddy
  - Cloudflare
  - Any domain registrar

### Step 2: Verify Domain in Resend

1. **Go to Resend Dashboard** → Domains
2. **Click "Add Domain"**
3. **Enter your domain** (e.g., `yourcompany.com`)
4. **Add DNS records** that Resend provides:
   - **TXT record** for domain verification
   - **CNAME record** for DKIM (email authentication)
   - **MX record** (if you want to receive emails too)

5. **Wait for verification** (usually 5-30 minutes)

### Step 3: Configure Environment Variables

Once verified, update your `.env.local`:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=noreply@yourcompany.com  # Now using your verified domain
NEXT_PUBLIC_APP_URL=https://yourcompany.com
NEXT_PUBLIC_USE_CUSTOM_EMAIL_CONFIRMATION=true
```

### Step 4: Test Production Emails

1. Try signing up with a real email address
2. Check inbox for confirmation email
3. Verify it's from `noreply@yourcompany.com`
4. Check that emails don't go to spam

## Email Address Options

Once your domain is verified, you can use any email address on that domain:

- `noreply@yourcompany.com` - No replies expected
- `hello@yourcompany.com` - Friendly greeting
- `support@yourcompany.com` - Customer support
- `notifications@yourcompany.com` - System notifications
- `aiarena@yourcompany.com` - Branded for your app

**Best Practice:** Use `noreply@yourcompany.com` for automated emails like confirmations.

## Cost Breakdown

### Resend Pricing:
- **Free Tier**: 3,000 emails/month, 100 emails/day
- **Pro Tier**: $20/month for 50,000 emails/month
- Perfect for startups!

### Domain Cost:
- **Domain registration**: ~$10-15/year (one-time annual fee)
- **No ongoing email hosting costs** (Resend handles everything)

## What If You Don't Have a Domain Yet?

**For Development:**
- ✅ Use Resend's test domain (`onboarding@resend.dev`)
- ✅ Test the entire email flow
- ✅ Develop and deploy your app

**Before Launch:**
- Get a domain
- Verify it with Resend
- Update environment variables
- Switch from test to production emails

## Alternative: Use Your Existing Email

If you already have a company email (like `hello@yourcompany.com`), you can:

1. Use that domain if you have access to DNS settings
2. Add the Resend DNS records to your domain
3. Start sending immediately

## Example: Full Setup Timeline

**Week 1 (Development):**
- ✅ Sign up for Resend
- ✅ Use test domain
- ✅ Build and test email functionality

**Week 2 (Before Launch):**
- ✅ Purchase domain (`yourcompany.com`)
- ✅ Verify domain in Resend (5-30 minutes)
- ✅ Update environment variables
- ✅ Test production emails

**Launch Day:**
- ✅ Users receive emails from `noreply@yourcompany.com`
- ✅ Professional branded emails
- ✅ No spam issues

## Troubleshooting

### "Domain not verified" error
- Check DNS records are added correctly
- Wait a bit longer (DNS can take up to 48 hours, but usually minutes)
- Verify records in Resend dashboard

### Emails going to spam
- Verify SPF/DKIM records are set correctly
- Use a professional sender name
- Don't send too many emails too quickly initially

### Can't access DNS settings
- Contact your domain registrar
- Or use a service like Cloudflare for DNS management (free)

## Summary

**Right Now:** No domain needed - use Resend's test domain to build  
**Before Production:** Get a domain and verify it (takes ~30 minutes)  
**Cost:** Domain ~$10/year + Resend free tier (3,000 emails/month)

You can start building and testing today, and set up your domain later before launch!
