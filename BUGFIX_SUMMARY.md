# BUGFIX SUMMARY: virtual_trades.size for CLOSE Trades

## 🐛 The Bug

**Symptom**: Close trade size was larger than open trade size by exactly `|realized_pnl| / close_price`

**Example**:
- Session: `f9196654-85c1-4bee-b8eb-eb8def339eec` (BTC-PERP)
- Open size: `0.06248148` BTC
- Close size: `0.06312783` BTC ❌
- Difference: `0.00064635 = 57.5659 / 89062.946` (PnL / price)

**Root Cause**: `virtual_trades.size` was recording `notionalUsd / fillPrice` (PnL-inflated) instead of actual position size closed.

---

## ✅ The Fix

### File: `lib/brokers/virtualBroker.ts`

#### 5 Changes Made:

1. **Line 229** - Track actual executed size:
   ```typescript
   let executedSize = size; // Track the actual executed size (not PnL-inflated)
   ```

2. **Line 291** - CLOSE: Use existing position size:
   ```typescript
   executedSize = existingSize; // BUGFIX: Record actual position size closed
   ```

3. **Line 320** - REDUCE: Use clamped close size:
   ```typescript
   executedSize = closeSize; // BUGFIX: Record actual position size reduced
   ```

4. **Line 416** - Record correct size:
   ```typescript
   size: Number(executedSize), // BUGFIX: Use actual executed size
   ```

5. **Lines 443-465** - Verification assertions:
   ```typescript
   // Check that close size matches position size, not PnL-derived size
   if (action === "close" && existingPosition) {
     const pnlDerivedSize = Math.abs(realizedPnl) / fillPrice;
     // Assert: executedSize != pnlDerivedSize (not the bug)
     // Assert: executedSize == existingSize (correct behavior)
   }
   ```

---

## 📊 Result

**After Fix**:
- Open size: `0.06248148` BTC
- Close size: `0.06248148` BTC ✅
- Realized PnL: `-57.5659` (unchanged, separate field)

---

## ✓ Verification

- ✅ **Compilation**: SUCCESS
- ✅ **Linting**: NO ERRORS
- ✅ **TypeScript**: PASSED
- ✅ **Runtime Assertions**: Added to catch regressions
- ✅ **Backwards Compatible**: No breaking changes

---

## 📝 Documentation

Full details in: `BUGFIX_VIRTUAL_TRADES_SIZE.md`

---

**Status**: ✅ **COMPLETE**  
**Date**: 2026-01-24
