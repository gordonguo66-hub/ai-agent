# Where to Put CRON_SECRET in cron-job.org

## ✅ Correct Location: Headers Section

### Step-by-Step:

1. **Find the "Headers" section** on the form
   - It should say "No custom headers defined."
   - There's a **"+ ADD"** button to the right

2. **Click the "+ ADD" button**

3. **Fill in the header fields:**
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer 5eec5617f8bc49eab28d1c1ad582ebaa829`
     - (Replace with your actual CRON_SECRET value)
     - Make sure "Bearer" is included with a space after it

4. **Save the header** (click Save or it auto-saves)

---

## ❌ Do NOT Use:

- **"Requires HTTP authentication"** section (Username/Password fields)
  - This is for Basic Auth, not what we need
  - Leave this toggle OFF

- **"Request body"** in Advanced section
  - This is for POST request bodies, not headers
  - Leave this empty

---

## ✅ Final Setup Should Look Like:

### Headers Section:
- **Authorization**: `Bearer 5eec5617f8bc49eab28d1c1ad582ebaa829`

### Other Sections:
- **Title**: `AI Trading Tick All Sessions`
- **URL**: `https://ai-agent-iota-pearl.vercel.app/api/cron/tick-all-sessions`
- **Request method**: `GET` (in Advanced section)
- **Execution schedule**: Every minute
- **Enable job**: ON

---

## Quick Summary:

**Click "+ ADD" in Headers section → Add `Authorization` header with `Bearer YOUR_CRON_SECRET`**
