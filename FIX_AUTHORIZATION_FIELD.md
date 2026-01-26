# Fix: Authorization in Wrong Field

## ❌ Current Issue:
You have the Authorization value in the **"Title"** field, but it should be in a separate **"Authorization"** or **"Headers"** field.

## ✅ Correct Setup:

### Step 1: Fix the Title Field
1. In the **"Title"** field, change it to:
   ```
   AI Trading Tick All Sessions
   ```
   (Or any descriptive name - NOT the Authorization value)

### Step 2: Find the Authorization/Headers Section
1. Look for a section labeled:
   - **"Authorization"** 
   - OR **"Request Headers"**
   - OR **"Headers"**
   - OR click a **"+"** or **"Add Header"** button

2. This section should have:
   - A field for **Header Name**: `Authorization`
   - A field for **Header Value**: `Bearer 5eec5617f8bc49eab28d1c1ad582ebaa829`

### Step 3: Add Authorization Header
1. In the Authorization/Headers section:
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer 5eec5617f8bc49eab28d1c1ad582ebaa829`
     - (Your actual CRON_SECRET value with "Bearer" prefix)

### Step 4: Verify All Fields
- ✅ **Title**: `AI Trading Tick All Sessions` (descriptive name)
- ✅ **URL**: `https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessions`
- ✅ **Authorization Header** (separate field):
  - Name: `Authorization`
  - Value: `Bearer 5eec5617f8bc49eab28d1c1ad582ebaa829`
- ✅ **Schedule**: Every minute
- ✅ **Enable job**: ON

---

## If You Can't Find Authorization/Headers Section:

Some cron-job.org interfaces have it in different places:

1. **Look for a dropdown or expandable section** that says "Authorization" or "Headers"
2. **Scroll down** - it might be below the URL field
3. **Check for tabs** like "Basic", "Advanced", "Headers"
4. **Look for a "+" button** to add custom headers

If you still can't find it, take a screenshot of the full form and I'll help you locate it!
