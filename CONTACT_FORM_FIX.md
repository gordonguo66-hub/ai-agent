# Contact Form - Receive Emails at support@coreboundai.io

## ❌ Current Issue:

Contact form is configured to send user queries to **support@coreboundai.io**, but Resend won't deliver them until you verify your domain.

**Right now:** User queries go to `gordonguo66@gmail.com` (your personal email) because that's your verified Resend email.

**What you want:** User queries should go to `support@coreboundai.io` (your company email).

---

## ✅ Solution: Verify Your Domain in Resend

### **Step 1: Go to Resend Dashboard**

1. Visit: **[resend.com/domains](https://resend.com/domains)**
2. Log in with your Resend account

### **Step 2: Add coreboundai.io Domain**

1. Click **"Add Domain"**
2. Enter: **`coreboundai.io`**
3. Click **"Add"**

### **Step 3: Add DNS Records**

Resend will show you DNS records to add. You need to add these to your domain registrar (wherever you bought coreboundai.io):

**Required DNS Records:**
```
Type: MX
Name: @
Value: feedback-smtp.us-east-1.amazonses.com
Priority: 10

Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all

Type: TXT
Name: resend._domainkey
Value: [Resend will provide this - copy exactly]

Type: TXT  
Name: _dmarc
Value: v=DMARC1; p=none; ...
```

### **Step 4: Wait for Verification**

- DNS propagation: 1-24 hours (usually ~1 hour)
- Resend will automatically check and verify
- You'll receive an email when verified

### **Step 5: Update Environment Variable**

Once verified, update your `.env.local`:

```bash
# Change from test domain to your verified domain
EMAIL_FROM=support@coreboundai.io
```

### **Step 6: Deploy to Production**

Update your production environment variables (Vercel, etc.):
```
EMAIL_FROM=support@coreboundai.io
```

---

## 🔧 Temporary Workaround (For Testing Now):

Until your domain is verified, user queries will continue going to **gordonguo66@gmail.com**. 

You can:
1. Check that Gmail inbox for user queries
2. Manually forward them or respond from there
3. OR set up email forwarding: gordonguo66@gmail.com → support@coreboundai.io

---

## ✅ After Domain Verification:

Once coreboundai.io is verified in Resend:
- ✅ Contact form will send to **support@coreboundai.io** automatically
- ✅ Email confirmation emails will come from **support@coreboundai.io**
- ✅ Professional branded emails
- ✅ No delivery limits

---

## 📧 How Email Will Work After Verification:

**User submits:**
```
From: john@example.com
Subject: "How do I connect exchange?"
Message: "I need help with API keys"
```

**You receive at support@coreboundai.io:**
```
From: Corebound <support@coreboundai.io>
To: support@coreboundai.io
Reply-To: john@example.com
Subject: Contact Form: How do I connect exchange?

[Formatted email with user's message and details]
```

**You reply → Goes directly to john@example.com** ✅

---

## ⏱️ Timeline:

- **Right now:** Queries go to gordonguo66@gmail.com (test mode)
  - **After domain verification:** Queries go to support@coreboundai.io (production)
- **Verification takes:** 1-24 hours after adding DNS records

---

## 🚀 Next Step:

**Go to [resend.com/domains](https://resend.com/domains) and add coreboundai.io now!**

This is required for production anyway, so best to do it before launch.
