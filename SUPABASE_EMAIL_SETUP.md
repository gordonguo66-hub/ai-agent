# Supabase Email Configuration

If you're not receiving confirmation emails after signing up, you have two options:

## Option 1: Disable Email Confirmation (Recommended for Development)

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** > **Settings** (or **Configuration**)
3. Scroll down to **Email Auth** section
4. Find **"Enable email confirmations"** or **"Confirm email"**
5. **Disable** it (turn it off)
6. Save changes

After disabling, users will be logged in immediately after sign-up without needing to confirm their email.

## Option 2: Configure Email Provider (For Production)

If you want to keep email confirmation enabled:

1. Go to **Authentication** > **Email Templates**
2. Configure the "Confirm signup" template
3. Go to **Project Settings** > **Auth** > **SMTP Settings**
4. Either:
   - Use Supabase's built-in email (limited, for development)
   - Configure a custom SMTP provider (Gmail, SendGrid, etc.)

## Verify Email Settings

To check your current settings:
1. Go to **Authentication** > **Providers** > **Email**
2. Check if **"Confirm email"** is enabled or disabled
3. Check **"Secure email change"** settings

## After Changing Settings

1. Refresh your browser
2. Try signing up again
3. If email confirmation is disabled, you should be logged in immediately
4. If email confirmation is enabled, check the email template and SMTP settings
