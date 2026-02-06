# Contact Form Setup - Corebound

## ✅ Current Status:

Contact form is working in **DEVELOPMENT MODE** - emails are sent to `gordonguo66@gmail.com` for testing.

---

## 🚀 Production Setup (Before Launch):

### **Step 1: Verify Your Domain in Resend**

1. Go to **[resend.com/domains](https://resend.com/domains)**
2. Click **"Add Domain"**
3. Add your domain: **`coreboundai.io`**
4. Follow Resend's instructions to add DNS records:
   - Add MX records
   - Add TXT records for SPF/DKIM
5. Wait for verification (usually 1-24 hours)

### **Step 2: Update Environment Variables**

Once your domain is verified, update `.env.local` (and production env vars):

```bash
# Change from default to your verified domain
EMAIL_FROM=support@coreboundai.io

# Set your actual support email
SUPPORT_EMAIL=support@coreboundai.io
```

### **Step 3: Test in Production**

After deploying with verified domain:
1. Visit your production site contact form
2. Submit a test message
3. Check support@coreboundai.io inbox
4. Verify Reply-To field works

---

## 🧪 Testing Now (Development):

**Contact form currently sends to:** `gordonguo66@gmail.com`

**To test:**
1. Visit: `http://localhost:3000/contact`
2. Fill out form with any email address
3. Click "Send Message"
4. ✅ Check `gordonguo66@gmail.com` inbox for the message
5. ✅ Reply-To field should contain the sender's email

---

## 📧 How It Works:

### **User Submits Form:**
```
User email: john@example.com
Subject: "Need help with API keys"
Message: "How do I connect my exchange?"
```

### **Email Sent To:**
- **Development:** gordonguo66@gmail.com (for testing)
- **Production:** support@coreboundai.io (after domain verification)

### **Email Format:**
```
From: Corebound <support@coreboundai.io>
To: support@coreboundai.io
Reply-To: john@example.com
Subject: Contact Form: Need help with API keys

[Formatted HTML email with user's message]
```

### **You Can Reply Directly:**
When you click "Reply" in your email client, it automatically replies to the user's email (john@example.com).

---

## 🎯 Files Involved:

- `app/contact/page.tsx` - Contact form UI
- `app/api/contact/route.ts` - Email sending logic
- `components/footer.tsx` - "Contact Us" button
- `lib/email/resend.ts` - Email service (with Reply-To support)

---

## ⚠️ Important for Launch:

**Before going live, you MUST:**
1. ✅ Verify coreboundai.io domain in Resend
2. ✅ Update EMAIL_FROM to support@coreboundai.io
3. ✅ Update SUPPORT_EMAIL to support@coreboundai.io
4. ✅ Test contact form in production

Otherwise, the contact form will fail in production!

---

## 💡 Alternative (If You Don't Want to Verify Domain):

Use a different email service provider or keep using the free Resend tier and forward emails manually. 

But domain verification is recommended for:
- ✅ Better deliverability
- ✅ Professional sender address
- ✅ No limitations on recipient emails
- ✅ Higher sending limits
