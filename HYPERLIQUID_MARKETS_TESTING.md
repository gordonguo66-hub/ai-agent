# Hyperliquid Markets Integration - Testing Guide

## Overview

The strategy builder now fetches the full list of tradable markets from Hyperliquid instead of using a hardcoded list. Users can search, select multiple markets, and see their selections as chips.

## Implementation Details

### 1. Server-Side Market Fetching
- **File**: `lib/hyperliquid/markets.ts`
- **Function**: `getHyperliquidMarkets()`
- Fetches from Hyperliquid's `/info` endpoint with `type: "meta"`
- Filters out delisted markets
- Normalizes to `SYMBOL-PERP` format
- Sorts: majors (BTC, ETH, SOL) first, then alphabetical

### 2. API Route with Caching
- **Endpoint**: `GET /api/hyperliquid/markets`
- **Caching**: In-memory cache with 5-minute TTL
- **Headers**: Cache-Control set to 60s public cache
- **Fallback**: Returns cached data if API fails

### 3. UI Components
- **Searchable Multi-Select**: Filter markets by typing
- **Selected Chips**: Shows selected markets with remove buttons
- **Action Buttons**:
  - "Select All Filtered" - Selects all markets matching search
  - "Select Majors" - Quick select BTC/ETH/SOL
  - "Clear" - Removes all selections
- **Manual Input Fallback**: Textarea for manual entry if API fails

## Testing Steps

### 1. Test API Endpoint
```bash
# Start dev server
npm run dev

# In another terminal, test the endpoint
curl http://localhost:3000/api/hyperliquid/markets
```

**Expected**: JSON response with `markets` array containing objects like:
```json
{
  "markets": [
    { "symbol": "BTC-PERP", "display": "BTC-PERP", "type": "PERP" },
    { "symbol": "ETH-PERP", "display": "ETH-PERP", "type": "PERP" },
    ...
  ]
}
```

### 2. Test UI - Normal Flow

1. Navigate to `/strategy/new`
2. Click on the **Markets** tab
3. Verify:
   - Markets list loads (may take 1-2 seconds)
   - Search input appears
   - Action buttons are visible
   - List is scrollable

4. **Test Search**:
   - Type "BTC" in search box
   - Verify only BTC-related markets show
   - Clear search to see all markets again

5. **Test Selection**:
   - Click on "BTC-PERP" checkbox
   - Verify it appears in selected chips above
   - Click the "×" on the chip to remove it
   - Verify it's removed from selection

6. **Test "Select Majors"**:
   - Click "Select Majors" button
   - Verify BTC-PERP, ETH-PERP, SOL-PERP are all selected
   - Verify chips appear for all three

7. **Test "Select All Filtered"**:
   - Type "SOL" in search
   - Click "Select All Filtered"
   - Verify all SOL markets are selected
   - Clear search to see all selections

8. **Test "Clear"**:
   - With markets selected, click "Clear"
   - Verify all selections are removed

9. **Test Form Submission**:
   - Select at least one market
   - Fill in other required fields
   - Submit form
   - Verify strategy is created with `filters.markets` containing selected symbols

### 3. Test Fallback Mode

To test the fallback, you can temporarily break the API:

1. **Option A - Network Issue Simulation**:
   - Disconnect internet
   - Navigate to `/strategy/new` → Markets tab
   - Verify warning message appears
   - Click "Switch to Manual Input"
   - Enter markets one per line:
     ```
     BTC-PERP
     ETH-PERP
     SOL-PERP
     ```
   - Verify they're parsed correctly
   - Submit form and verify markets are saved

2. **Option B - API Error Simulation**:
   - Temporarily modify `lib/hyperliquid/markets.ts` to throw an error
   - Reload the page
   - Verify fallback UI appears

### 4. Test Performance

1. **Large Selection**:
   - Select 20+ markets
   - Verify UI remains responsive
   - Verify chips display correctly (may wrap to multiple lines)
   - Verify form submission works

2. **Search Performance**:
   - With full market list loaded, type in search
   - Verify filtering is instant (no lag)
   - Try typing quickly to verify no debouncing issues

### 5. Verify Data Storage

1. Create a strategy with multiple markets selected
2. Check database:
   ```sql
   SELECT filters->>'markets' FROM strategies WHERE id = '<strategy_id>';
   ```
3. Verify `filters.markets` is a JSON array:
   ```json
   ["BTC-PERP", "ETH-PERP", "SOL-PERP", ...]
   ```

## Expected Behavior

✅ **Success Cases**:
- Markets load from Hyperliquid API
- Search filters markets instantly
- Multiple markets can be selected
- Selected markets show as chips
- Form validation requires at least 1 market
- Markets are saved correctly in `filters.markets`

✅ **Error Handling**:
- If API fails, fallback message appears
- Manual input mode works
- Cached data is used if API fails but cache exists
- Form still validates with manual input

## Troubleshooting

### Markets not loading
- Check browser console for errors
- Verify `/api/hyperliquid/markets` returns data
- Check network tab for failed requests
- Verify Hyperliquid API is accessible

### Search not working
- Verify `marketSearch` state is updating
- Check that `filteredMarkets` is computed correctly
- Verify markets array is populated

### Selection not persisting
- Check that `selectedMarkets` state updates
- Verify `toggleMarket` function is called
- Check form submission includes markets in filters

### Performance issues
- If list is too slow, consider virtualizing (not implemented yet)
- Check that search filtering is efficient
- Verify no unnecessary re-renders

## Notes

- Markets are cached for 5 minutes server-side
- Client-side search is instant (no API calls per keystroke)
- Manual input normalizes symbols (uppercase, hyphens)
- Selected markets are stored as-is in `filters.markets` array
