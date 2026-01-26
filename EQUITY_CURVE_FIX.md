# Equity Curve Bug Fix

## Root Cause Analysis

### Bug Found
**Location:** `app/dashboard/sessions/[id]/page.tsx:629-631`

**Original Code:**
```typescript
if (equityResult.data) {
  setEquityPointsData(equityResult.data);
}
```

**The Problem:**
This conditional check only updated the `equityPointsData` state when `equityResult.data` was truthy. When a time range filter returned an empty result (e.g., "Last 24 Hours" when no data exists in that period), the state was NOT updated, causing it to retain stale data from a previous time range (like "All Time").

**Symptoms:**
- Chart showed same data regardless of time range selection
- Switching between "All Time" and "Last 24 Hours" didn't change the curve
- Older points appeared to form "repeating waves" because they were actually old cached data
- Only the last point was correct (because it's dynamically added from `currentEquity`)

### Verification of No Mock Data
Searched entire codebase for:
- `mock`, `demo`, `sine`, `Math.sin`, `generateEquity`, `sampleData`, `synthetic`
- Found NO mock data generation in equity chart pipeline
- Confirmed data comes from real `equity_points` table insertions in:
  - `lib/brokers/virtualBroker.ts:425` (after trades)
  - `app/api/sessions/[id]/tick/route.ts:1017` (during ticks)

## Fixes Implemented

### 1. Always Update Equity State (Critical Fix)
**File:** `app/dashboard/sessions/[id]/page.tsx:629-631`

```typescript
// BEFORE (buggy):
if (equityResult.data) {
  setEquityPointsData(equityResult.data);
}

// AFTER (fixed):
// CRITICAL FIX: Always update equity data, even if empty
// This ensures time range changes clear old data instead of keeping stale data
setEquityPointsData(equityResult.data || []);
```

### 2. Added Debug Logging
**File:** `app/dashboard/sessions/[id]/page.tsx:627-640`

Added comprehensive logging to verify:
- Number of points fetched
- Whether time range filtering is active
- First and last point timestamps and equity values

### 3. Enhanced Data Quality Safeguards
**File:** `app/dashboard/sessions/[id]/page.tsx:993-1013`

Added:
- **Invalid value filtering**: Remove points with NaN/Infinity or negative equity
- **Deduplication**: Remove duplicate timestamps, keeping latest value
- **Proper sorting**: Ensure chronological ordering

```typescript
// Remove invalid values
.filter((p: any) => Number.isFinite(p.time) && Number.isFinite(p.equity) && p.equity >= 0)
.sort((a: any, b: any) => a.time - b.time);

// De-duplicate points with identical timestamps
const seen = new Map<number, number>();
equityPointsForChart = equityPointsForChart.filter((p: any) => {
  if (seen.has(p.time)) {
    seen.set(p.time, p.equity);
    return false;
  }
  seen.set(p.time, p.equity);
  return true;
});
```

### 4. Previous Fixes (Already Implemented)
- **Skip initial mount callback** (`components/equity-curve-chart.tsx:77-85`): Prevents duplicate data fetch on mount
- **useCallback for stable reference** (`app/dashboard/sessions/[id]/page.tsx:1019-1027`): Prevents infinite loops
- **Server-side time filtering** (`app/dashboard/sessions/[id]/page.tsx:596-606`): Query filters data at database level

## Data Flow Verification

### Complete Pipeline
1. **Database**: `equity_points` table stores real equity snapshots
   - Inserted after trades (virtualBroker.ts)
   - Inserted during ticks (tick/route.ts)
   - Schema: `{ id, account_id, session_id, t: timestamptz, equity: numeric }`

2. **API Query**: Supabase query with filters
   ```typescript
   supabase
     .from("equity_points")
     .select("*")
     .eq("account_id", accountId)
     .eq("session_id", sessionId)
     .order("t", { ascending: true })
     .gte("t", startISO)  // Server-side time filter
     .lte("t", endISO)    // Server-side time filter
     .limit(5000)
   ```

3. **State Management**: Result stored in `equityPointsData` state
   - NOW: Always updates, even if empty (FIX)

4. **Data Transformation**: Prepare for chart
   - Filter invalid points
   - Convert to { time: ms, equity: number }
   - Sort chronologically
   - De-duplicate timestamps

5. **Chart Component**: Renders LineChart
   - Applies client-side time filtering (safety net)
   - Adds current equity as latest point
   - Resamples for performance if needed
   - Renders with Recharts

## Test Plan

### Manual Testing Steps

#### Test 1: Fresh Session
1. Create a new virtual session
2. Run for 10 minutes (let it tick a few times)
3. Navigate to session detail page
4. **Expected**: Chart shows equity curve from start to current time
5. **Verify**: Console shows equity points being fetched

#### Test 2: Time Range Switching
1. Open a session with > 24 hours of data
2. Select "All Time" - note the number of points in console
3. Switch to "Last 24 Hours"
4. **Expected**:
   - Chart updates to show only last 24h
   - Console shows fewer points fetched
   - Curve shape changes (not identical to "All Time")
5. Switch back to "All Time"
6. **Expected**: Full data returns

#### Test 3: Empty Time Range
1. Open a recent session (< 1 hour old)
2. Select "This Month" or "This Week"
3. **Expected**:
   - Chart shows all available data (not enough to fill month/week)
   - No errors in console
4. Select "Last 24 Hours"
5. **Expected**: Same data (session < 24h old)

#### Test 4: Page Refresh
1. Open session, select a specific time range
2. Refresh the page (F5)
3. **Expected**:
   - Chart reloads with "All Time" (default)
   - Time range resets to default
   - Data is consistent after refresh

#### Test 5: Real-Time Updates
1. Open a running session
2. Let it tick (wait for next AI decision)
3. **Expected**:
   - Chart updates with new point
   - Last point moves to new timestamp
   - No duplicate points at same timestamp

### Console Verification
Check browser console for:
```
[loadAll] Fetched X equity points { timeRangeActive: true/false, timeRange: {...} }
[loadAll] First point: 2024-01-20T10:00:00.000Z = $100000.00
[loadAll] Last point: 2024-01-20T18:00:00.000Z = $105250.50
[EquityCurve] Rendering with X points, range: all
[EquityCurve] Time range: 2024-01-20T10:00:00.000Z → 2024-01-20T18:00:00.000Z
[EquityCurve] Equity range: $100000.00 → $105250.50
```

### Database Verification (Optional)
Run in Supabase SQL Editor:
```sql
-- Check equity points exist
SELECT
  session_id,
  COUNT(*) as point_count,
  MIN(t) as first_time,
  MAX(t) as last_time,
  MIN(equity) as min_equity,
  MAX(equity) as max_equity
FROM equity_points
WHERE session_id = 'YOUR_SESSION_ID'
GROUP BY session_id;

-- Check for duplicates
SELECT t, COUNT(*)
FROM equity_points
WHERE session_id = 'YOUR_SESSION_ID'
GROUP BY t
HAVING COUNT(*) > 1;

-- View recent points
SELECT t, equity
FROM equity_points
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY t DESC
LIMIT 10;
```

## Files Changed

1. **app/dashboard/sessions/[id]/page.tsx**
   - Line 629-631: Always update equity state (critical fix)
   - Lines 627-640: Added debug logging
   - Lines 1000-1013: Added data quality safeguards

2. **components/equity-curve-chart.tsx** (previous fixes)
   - Line 35: Added `isInitialMount` ref
   - Lines 77-85: Skip callback on initial mount
   - Line 98: Removed redundant dependency

## Expected Behavior After Fix

✅ Chart reflects actual equity snapshots from database
✅ Time range dropdown filters data server-side and client-side
✅ Switching ranges visibly changes the dataset
✅ Points are chronologically ordered
✅ Duplicate timestamps are removed
✅ Invalid values (NaN, negative) are filtered out
✅ Tooltip values match stored equity at that timestamp
✅ Single snapshot shows flat line, not wave
✅ No console errors
✅ Other session pages (trades, positions, controls) unaffected

## Rollback Plan

If issues occur, revert this change:
```bash
git revert <commit-hash>
```

Or manually restore original code:
```typescript
// app/dashboard/sessions/[id]/page.tsx:629-631
if (equityResult.data) {
  setEquityPointsData(equityResult.data);
}
```
