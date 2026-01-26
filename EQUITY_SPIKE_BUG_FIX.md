# Equity Spike Bug Fix Summary

## The Problem

Users reported seeing massive fake equity spikes (±$650-700) on the equity curve chart, occurring every few minutes. These spikes appeared as:
- Equity drops -$650-700 in one second
- Then jumps back up +$650-700 about 3 seconds later
- This pattern repeated throughout the session

**Example from database (session at 22:49):**
```
22:49:07: equity = $99,786  (drops -$684)
22:49:10: equity = $100,471 (jumps +$684 in 3 seconds!)
22:50:13: equity = $99,887  (drops -$584)
```

No trades were executed during these times, yet the equity swung wildly.

## Root Cause

The bug was in `lib/brokers/virtualBroker.ts` **lines 467-485**.

Every time a trade was executed via `placeMarketOrder()`:

1. **Line 474**: Called `markToMarket(account_id, { [market]: midPrice })`
   - This calculated equity using **ONLY the traded market's fresh price**
   - All **other open positions** used **stale unrealized PnL values** from the database
   - Result: Equity was calculated INCORRECTLY (missing ~$650-700 unrealized PnL from other positions)

2. **Lines 479-485**: Immediately recorded this INCORRECT equity as an equity point
   ```typescript
   const updatedAccount = await getAccount(account_id);
   if (updatedAccount) {
     await serviceClient.from("equity_points").insert({
       account_id,
       session_id,
       t: new Date().toISOString(),
       equity: updatedAccount.equity, // ⚠️ WRONG EQUITY!
     });
   }
   ```

3. **3 seconds later**: The tick endpoint (at lines 1305-1318 of `app/api/sessions/[id]/tick/route.ts`) calculated equity correctly using fresh prices for ALL markets and recorded another equity point.

**Result:** Two equity points were recorded per trade:
- One with INCORRECT equity (missing PnL from other positions) - recorded immediately after trade
- One with CORRECT equity - recorded 3 seconds later at end of tick

The chart displayed BOTH points, creating the fake ±$650-700 spikes.

## The Fix

**Changed file:** `lib/brokers/virtualBroker.ts` (lines 467-478)

**Removed:**
```typescript
// Mark to market to update equity
await markToMarket(account_id, { [market]: midPrice });

// Record equity point
const updatedAccount = await getAccount(account_id);
if (updatedAccount) {
  await serviceClient.from("equity_points").insert({
    account_id,
    session_id,
    t: new Date().toISOString(),
    equity: updatedAccount.equity,
  });
}
```

**Replaced with:**
```typescript
// REMOVED: markToMarket and equity point recording
// The tick endpoint already handles this correctly at the end of each tick
// with fresh prices for ALL markets. Recording equity here with only ONE
// market's price causes fake equity spikes due to stale prices for other positions.
```

Now the tick endpoint is the **only** place that records equity points, and it does so correctly using fresh prices for ALL markets.

## Verification

After deploying the fix:
1. The server successfully restarted
2. Sessions are now recording only ONE equity point per tick (at the end)
3. Future equity curves should no longer show fake spikes

## Impact

- ✅ Fixes fake equity spikes on chart
- ✅ Eliminates duplicate equity point recordings per trade
- ✅ Reduces database writes (fewer equity_points inserts)
- ✅ Improves accuracy of equity curve display
- ✅ No functional changes to trading logic or PnL calculations

## Date

Fixed: January 25, 2026
