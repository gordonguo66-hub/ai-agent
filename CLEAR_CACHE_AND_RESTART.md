# How to Clear Browser Cache & Restart Dev Server

## Method 1: Clear Browser Cache (Chrome/Edge)

### Quick Method (Hard Refresh):
1. **Open your app** in the browser
2. **Press these keys together:**
   - **Mac:** `Cmd + Shift + R`
   - **Windows/Linux:** `Ctrl + Shift + R`
3. This forces a hard refresh (bypasses cache)

### Full Cache Clear (Chrome):
1. **Open Chrome**
2. **Press:** `Cmd + Shift + Delete` (Mac) or `Ctrl + Shift + Delete` (Windows)
3. **Select:**
   - ✅ "Cached images and files"
   - Time range: "All time" or "Last hour"
4. **Click:** "Clear data"
5. **Refresh the page**

### Full Cache Clear (Edge):
1. **Open Edge**
2. **Press:** `Cmd + Shift + Delete` (Mac) or `Ctrl + Shift + Delete` (Windows)
3. **Select:**
   - ✅ "Cached images and files"
   - Time range: "All time"
4. **Click:** "Clear now"
5. **Refresh the page**

### Full Cache Clear (Safari):
1. **Open Safari**
2. **Menu:** Safari → Settings → Advanced
3. **Check:** "Show Develop menu in menu bar"
4. **Menu:** Develop → Empty Caches
5. **Refresh the page**

---

## Method 2: Restart Dev Server

### If Dev Server is Running:

1. **Find the terminal** where `npm run dev` is running
2. **Stop it:**
   - Press `Ctrl + C` (or `Cmd + C` on Mac)
   - Wait for it to stop

3. **Restart it:**
   ```bash
   cd "/Users/gordon/Desktop/AI Agent"
   npm run dev
   ```

### If Dev Server is NOT Running:

1. **Open terminal**
2. **Navigate to project:**
   ```bash
   cd "/Users/gordon/Desktop/AI Agent"
   ```

3. **Start dev server:**
   ```bash
   npm run dev
   ```

4. **Wait for:** "Ready on http://localhost:3000"

---

## Method 3: Complete Fresh Start

### Step 1: Stop Dev Server
```bash
# In the terminal where dev server is running
Ctrl + C  (or Cmd + C on Mac)
```

### Step 2: Clear Next.js Cache
```bash
cd "/Users/gordon/Desktop/AI Agent"
rm -rf .next
```

### Step 3: Clear Node Modules Cache (Optional)
```bash
rm -rf node_modules/.cache
```

### Step 4: Restart Dev Server
```bash
npm run dev
```

### Step 5: Clear Browser Cache
- **Hard refresh:** `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
- **OR** Clear cache using Method 1 above

---

## Quick Commands Summary:

### Hard Refresh (Fastest):
- **Mac:** `Cmd + Shift + R`
- **Windows:** `Ctrl + Shift + R`

### Restart Dev Server:
```bash
# Stop: Ctrl + C
# Start: npm run dev
```

### Complete Fresh Start:
```bash
cd "/Users/gordon/Desktop/AI Agent"
rm -rf .next
npm run dev
```

---

## Verify It's Working:

After clearing cache and restarting:

1. **Open your app:** `http://localhost:3000/strategy/new`
2. **Go to "Markets" tab**
3. **Check "Decision Cadence" section:**
   - Hours: 0
   - Minutes: 0
   - Seconds: Should show **60** (not 30!)
4. **Try to change seconds:**
   - Should be **read-only** (can't edit)
   - Should always show **60**

---

## Troubleshooting:

**If still seeing 30 seconds:**
1. Make sure dev server restarted
2. Make sure you did hard refresh (`Cmd + Shift + R`)
3. Try incognito/private window
4. Check browser console for errors (F12)

**If dev server won't start:**
```bash
# Kill any process on port 3000
lsof -ti:3000 | xargs kill -9

# Then restart
npm run dev
```

---

**Try the hard refresh first - it's the fastest way!**
