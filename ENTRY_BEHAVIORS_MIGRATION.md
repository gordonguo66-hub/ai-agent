# Entry Behaviors Migration Guide

**Date**: 2026-01-23  
**Change**: Refactored "Entry Mode" dropdown to "Entry Behaviors" toggles

---

## Overview

The Strategy Builder's "Entry Mode" dropdown has been replaced with three independent "Entry Behaviors" toggles. This change provides more granular control over what types of entries the AI is allowed to take, treating each behavior as a **guardrail** rather than a mutually exclusive strategy type.

---

## What Changed

### Before (Old UI)
- **Entry Mode** dropdown with 4 options:
  - Signal (AI-driven) - All entry types allowed
  - Trend Following - Only trend entries
  - Breakout - Only breakout entries
  - Mean Reversion - Only mean reversion entries

### After (New UI)
- **Entry Behaviors** section with 3 toggles:
  - ✅ Allow Trend-Following Entries
  - ✅ Allow Breakout Entries
  - ✅ Allow Mean-Reversion Entries

Each toggle can be independently enabled/disabled, allowing combinations like:
- Trend + Breakout (no mean reversion)
- Trend only
- All three enabled (default)
- All three disabled (blocks all entries)

---

## Backwards Compatibility

### Automatic Migration

**No database migration required!** The system automatically converts old `entry.mode` values to the new `entry.behaviors` format when loading existing strategies:

| Old `entry.mode` | New `entry.behaviors` |
|------------------|----------------------|
| `"signal"` | `{ trend: true, breakout: true, meanReversion: true }` |
| `"trend"` | `{ trend: true, breakout: false, meanReversion: false }` |
| `"breakout"` | `{ trend: false, breakout: true, meanReversion: false }` |
| `"meanReversion"` | `{ trend: false, breakout: false, meanReversion: true }` |

### Migration Locations

The migration logic is implemented in **two places**:

1. **Frontend (Strategy Form)** - `components/strategy-form.tsx`
   - When loading a strategy for editing, if `entry.behaviors` doesn't exist, it's derived from `entry.mode`
   - Console logs: `[Migration] Derived behaviors from entry.mode="X"`

2. **Backend (Tick Endpoint)** - `app/api/sessions/[id]/tick/route.ts`
   - When executing a tick, if `entry.behaviors` doesn't exist, it's derived from `entry.mode`
   - Console logs: `[Tick] Derived behaviors from entry.mode="X"`

### Saving New Strategies

When saving from the UI:
- The new `entry.behaviors` object is saved to `filters.entryExit.entry.behaviors`
- The old `entry.mode` field is kept as `"signal"` for backwards compatibility (but UI no longer depends on it)

---

## Trading Logic Changes

### Behavior Enforcement

The tick endpoint now enforces entry behaviors as **guardrails**:

1. **Safety Check**: If all three behaviors are disabled (`trend=false, breakout=false, meanReversion=false`), all entries are blocked:
   ```
   ⛔ No entry behaviors enabled - all entries blocked by strategy settings
   ```

2. **Classification**: Each AI trading intent is classified as one of three types:
   - **Trend**: EMA divergence > 1% OR reasoning mentions "trend/momentum/uptrend/downtrend"
   - **Breakout**: ATR > 2% of price OR reasoning mentions "breakout/resistance/support"
   - **Mean Reversion**: RSI < 30 or > 70 OR reasoning mentions "reversion/oversold/overbought/mean"

3. **Enforcement**: If the classified entry type is disabled, the entry is blocked:
   ```
   ⛔ Trend entry blocked - trend behavior disabled
   ⛔ Breakout entry blocked - breakout behavior disabled
   ⛔ Mean reversion entry blocked - meanReversion behavior disabled
   ```

### AI Prompt Changes

The AI now receives behavior information instead of a single mode:

**Before**:
```json
{
  "entryMode": "trend",
  "entryInstructions": "Focus on trend-following signals..."
}
```

**After**:
```json
{
  "entryBehaviors": {
    "trend": true,
    "breakout": false,
    "meanReversion": false
  },
  "entryInstructions": "Only these entry types are allowed: trend-following. Focus your analysis on these patterns only."
}
```

---

## No Breaking Changes

### All Existing Features Still Work

- ✅ Risk management (max position, max loss, leverage)
- ✅ Trade control (frequency limits, cooldown, min hold time)
- ✅ Exit configuration (TP/SL, AI-driven exits)
- ✅ Confidence control (min confidence, scaling)
- ✅ AI inputs (candles, orderbook, indicators)
- ✅ Entry confirmation (min signals, trend alignment, volatility condition)
- ✅ Guardrails (allow long/short)

### No Strategy Re-configuration Required

Existing strategies will continue to work without any user action. The first time you edit an old strategy:
1. The UI will show the derived toggles based on the old mode
2. You can adjust the toggles as desired
3. Saving will persist the new behaviors format

---

## Benefits of This Change

### 1. More Granular Control
Users can now combine entry types (e.g., "Trend + Breakout but no Mean Reversion") instead of being locked into a single mode.

### 2. Clearer Mental Model
Each behavior is now a **guardrail** (allow/deny) rather than a strategy archetype. This aligns better with how the system actually works - the AI makes decisions, and behaviors restrict what's allowed.

### 3. Safer Defaults
Users can disable specific entry types they don't want (e.g., disable mean reversion in trending markets) without creating entirely separate strategies.

### 4. Better Logging
Entry decisions now log which behavior was detected and whether it was allowed:
```
[Tick] ✅ Entry type 'trend' is allowed (Behaviors: Trend=true, Breakout=true, MeanRev=false)
[Tick] ⛔ Breakout entry blocked - breakout behavior disabled
```

---

## Testing & Verification

### Backwards Compatibility Tests

✅ **Test 1**: Legacy strategy with `entry.mode="trend"`
- Expected: Loads with `behaviors.trend=true`, others false
- Verified: Console logs migration, UI shows correct toggles

✅ **Test 2**: Strategy with all behaviors disabled
- Expected: No entries occur, logs "No entry behaviors enabled"
- Verified: Entry blocked with clear log message

✅ **Test 3**: Save from UI persists behaviors
- Expected: New `entry.behaviors` object saved to database
- Verified: Reload strategy shows same toggle states

### Manual Verification Checklist

- [x] Create new strategy → toggles appear → save → reload → toggles persist
- [x] Load old strategy (mode="trend") → toggles show trend=true only
- [x] Load old strategy (mode="signal") → toggles show all three enabled
- [x] Disable all toggles → start session → no entries occur
- [x] Disable one toggle → AI suggests that type → entry blocked
- [x] All other features (risk, exits, confidence) unchanged

---

## Files Changed

### 1. `components/strategy-form.tsx`
- Added `behaviors` to initial state (line 165-169)
- Added migration logic when loading strategies (lines 280-292, 295-310)
- Replaced Entry Mode dropdown with 3 toggles (lines 1200-1280)
- Updated Summary panel to show behaviors (lines 1850-1860)

### 2. `app/api/sessions/[id]/tick/route.ts`
- Added migration logic for behaviors (lines 690-698)
- Added behavior enforcement section (lines 871-929)
- Updated AI prompt to send behaviors instead of mode (lines 754-771)
- Updated trend alignment fallback to use behaviors (lines 1088-1096)

### 3. `ENTRY_BEHAVIORS_MIGRATION.md` (this file)
- Complete migration documentation

---

## Support & Troubleshooting

### Issue: Old strategy not showing correct toggles
**Solution**: Check browser console for migration logs. If missing, the strategy may have a non-standard format. Contact support.

### Issue: Entries still blocked after enabling toggles
**Solution**: Check:
1. Are other guardrails blocking it? (allowLong/allowShort, confidence, trade frequency)
2. Check decision logs for the specific blocking reason
3. Verify the session is using the updated strategy (restart session if needed)

### Issue: Want to revert to old UI
**Solution**: Not supported. The old `entry.mode` field is still stored for compatibility, but the UI now exclusively uses behaviors. Contact support if this is a blocker.

---

## Migration Rollout Plan

### Phase 1: Deployed (2026-01-23)
- ✅ Code changes deployed
- ✅ Automatic migration enabled
- ✅ All existing strategies continue working

### Phase 2: User Communication (Next 7 days)
- [ ] Send email to users explaining the change
- [ ] Add in-app notification about new Entry Behaviors feature
- [ ] Update help documentation and video tutorials

### Phase 3: Cleanup (30 days after)
- [ ] Remove `entry.mode` field from UI state (keep in DB for history)
- [ ] Remove old mode-based logic (already replaced)
- [ ] Archive old Entry Mode documentation

---

**End of Migration Guide**
