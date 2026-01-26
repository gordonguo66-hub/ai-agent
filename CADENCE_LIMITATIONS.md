# AI Cadence Limitations: 10 Seconds vs Cron Frequency

## Current Setup:

### Cron Job Frequency:
- **Runs every 1 minute** (60 seconds)
- Configured in cron-job.org: `* * * * *` (every minute)

### How Cadence Works:
The cron job checks if enough time has passed since the last tick:
```typescript
const cadenceSeconds = strategyFilters.cadenceSeconds || session.cadence_seconds || 30;
const timeSinceLastTick = now - lastTickAt;
// Only tick if timeSinceLastTick >= cadenceSeconds
```

---

## If User Sets Cadence to 10 Seconds:

### What Happens:
- ✅ **Will it work?** Yes, technically
- ⚠️ **Will it tick every 10 seconds?** No
- ✅ **Will it tick?** Yes, every 60 seconds (when cron runs)

### Why:
- Cron runs every **60 seconds**
- After 60 seconds, cron checks: "Has 10 seconds passed since last tick?"
- Answer: **Yes** (60 > 10)
- So it ticks
- But it can't tick more frequently than cron runs (every 60 seconds)

### Result:
- **User wants:** Tick every 10 seconds
- **What happens:** Ticks every 60 seconds (limited by cron frequency)

---

## Minimum Cadence:

### Current Limitation:
- **Minimum effective cadence = 60 seconds** (cron frequency)
- Even if user sets 10 seconds, it will tick every 60 seconds

### To Support 10-Second Cadence:

**Option 1: Increase Cron Frequency**
- Change cron-job.org to run every 10 seconds: `*/10 * * * *`
- **Problem:** Most free cron services don't support < 1 minute
- **Solution:** Use a paid cron service or self-hosted solution

**Option 2: Use Vercel Cron (Pro Plan)**
- Vercel Pro supports minute-by-minute cron
- But still can't do 10-second intervals
- **Cost:** $20/month

**Option 3: Queue System**
- Use a message queue (Redis Queue, BullMQ)
- Process ticks asynchronously
- Can support any cadence
- **Cost:** Requires additional infrastructure

**Option 4: Accept Limitation**
- Set minimum cadence to 60 seconds
- Inform users that cadence must be >= 60 seconds
- **Cost:** Free, but limits functionality

---

## Recommended Solution:

### For Free Tier:

**Set Minimum Cadence:**
1. **In your strategy form:**
   - Add validation: `cadenceSeconds >= 60`
   - Show message: "Minimum cadence is 60 seconds"

2. **In your UI:**
   - Display: "AI Cadence: Minimum 1 minute"
   - Explain: "Cron job runs every minute"

### For Paid Tier (Future):

**If you upgrade to Vercel Pro:**
- Can use built-in cron (still 1-minute minimum)
- OR use external service with 10-second support
- OR implement queue system

---

## Code Changes Needed:

### Add Validation:

```typescript
// In strategy-form.tsx or API route
if (cadenceSeconds < 60) {
  return NextResponse.json(
    { error: "Minimum AI cadence is 60 seconds (1 minute)" },
    { status: 400 }
  );
}
```

### Update UI:

```typescript
// Show minimum cadence in form
<Label>AI Cadence (Minimum: 60 seconds)</Label>
<p className="text-xs text-muted-foreground">
  The system checks for new decisions every minute. 
  Minimum cadence is 60 seconds.
</p>
```

---

## Summary:

### Current Behavior:
- ✅ **10-second cadence will "work"** (won't error)
- ⚠️ **But ticks every 60 seconds** (not 10 seconds)
- ⚠️ **Limited by cron frequency** (runs every minute)

### Recommended:
1. **Add validation** - Prevent cadence < 60 seconds
2. **Update UI** - Show minimum 60 seconds
3. **Document limitation** - Explain to users

### Future Options:
- **Upgrade infrastructure** - Support faster cadences
- **Use queue system** - For sub-minute cadences
- **Accept limitation** - Keep 60-second minimum

---

**Bottom line: 10-second cadence won't tick every 10 seconds - it will tick every 60 seconds (when cron runs). Add validation to prevent confusion!**
