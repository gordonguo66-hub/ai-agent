# AI Context Debug Modal - Multi-Market Support Fix

## Problem Statement

The "AI Context Debug" modal had several issues:

1. **404 Error**: The `/api/sessions/[id]/debug-context` endpoint existed but may have had auth/routing issues
2. **Single Market Display**: Modal only showed "Market: BTC-PERP" even when session had multiple markets `["BTC-PERP","ETH-PERP","SOL-PERP"]`
3. **No Market Selection**: Users couldn't view AI context for different markets
4. **Poor Error Handling**: Errors were not displayed clearly
5. **Unclear Behavior**: Modal didn't explain how the decision engine processes markets

## How the Decision Engine Works

**Evidence from Code Analysis** (`app/api/sessions/[id]/tick/route.ts`):

### Round-Robin, One Market Per Tick

```typescript
// Lines 341-345
const marketIndex = ticksSinceStart % markets.length;
const marketsToProcess = [markets[marketIndex]]; // Process only one market per tick

console.log(`[Tick] 🔄 Round-robin: Processing market ${marketIndex + 1}/${markets.length} (${marketsToProcess[0]})`);
console.log(`[Tick] 📊 This reduces AI calls from ${markets.length} per tick to 1 per tick`);
```

**Key Facts**:
- ✅ The AI is called **once per tick**
- ✅ Each tick processes **one market** (not all markets)
- ✅ Markets rotate in **round-robin fashion** (BTC → ETH → SOL → BTC → ...)
- ✅ The tick number determines which market: `marketIndex = ticksSinceStart % markets.length`

**Why?** Cost optimization - reduces AI API calls from N per tick to 1 per tick.

---

## Solution Implemented

### 1. Backend: Enhanced `/api/sessions/[id]/debug-context`

**File**: `app/api/sessions/[id]/debug-context/route.ts`

#### Changes:

**a) Accept `?market=` Query Parameter**
```typescript
// Lines 69-77
const { searchParams } = new URL(request.url);
const requestedMarket = searchParams.get("market");
const market = requestedMarket && markets.includes(requestedMarket) 
  ? requestedMarket 
  : markets[0];

console.log(`[Debug Context] Session markets: [${markets.join(", ")}]`);
console.log(`[Debug Context] Requested market: ${requestedMarket || "(none - using default)"}`);
console.log(`[Debug Context] Showing context for: ${market}`);
```

**b) Return All Session Markets + Selected Market**
```typescript
// Lines 264-275
return NextResponse.json({
  sessionId,
  strategyName: strategy.name,
  sessionMarkets: markets, // ✅ NEW: All markets configured for this session
  selectedMarket: market,  // ✅ NEW: The market being shown (from ?market= or default)
  market, // Keep for backward compatibility
  aiInputsConfigured: aiInputs,
  contextSentToAI: context,
  fullPrompt: { system: systemPrompt, user: userPrompt },
  note: requestedMarket && !markets.includes(requestedMarket)
    ? `⚠️ Requested market '${requestedMarket}' not found in session. Showing '${market}' instead. Available markets: ${markets.join(", ")}`
    : "This shows what would be sent to the AI for a single market. The AI processes one market per tick in round-robin fashion.",
});
```

**c) Better Error Messages**
- Returns `sessionMarkets: []` when no markets configured
- Shows warning note if requested market not found
- Explains round-robin behavior in note

### 2. Frontend: Enhanced Modal UI

**File**: `app/dashboard/sessions/[id]/page.tsx`

#### Changes:

**a) Added State for Market Selection** (Line ~36)
```typescript
const [selectedDebugMarket, setSelectedDebugMarket] = useState<string | null>(null);
```

**b) Created `loadDebugContext` Helper** (Lines ~717-745)
```typescript
const loadDebugContext = async (market: string | null = null) => {
  setLoadingDebugContext(true);
  try {
    const marketParam = market ? `?market=${encodeURIComponent(market)}` : '';
    const response = await fetchWithAuthRetry(`/api/sessions/${sessionId}/debug-context${marketParam}`, {
      method: 'GET',
    });
    
    if (response.ok) {
      const data = await response.json();
      setDebugContext(data);
      
      // If we got sessionMarkets and no market is selected yet, set first market
      if (data.sessionMarkets && data.sessionMarkets.length > 0 && !selectedDebugMarket) {
        setSelectedDebugMarket(data.sessionMarkets[0]);
      }
    } else {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      setDebugContext({ 
        error: errorData.error || `Failed to load context (${response.status})`,
        statusCode: response.status
      });
    }
  } catch (error: any) {
    console.error("Debug context error:", error);
    setDebugContext({ 
      error: error.message || "Failed to load context. Please check console for details.",
      details: error.toString()
    });
  } finally {
    setLoadingDebugContext(false);
  }
};
```

**c) Updated "View AI Context" Button** (Lines ~1217-1226)
```typescript
<Button
  variant="outline"
  onClick={async () => {
    // Initialize with first market when opening
    if (session?.markets && Array.isArray(session.markets) && session.markets.length > 0) {
      setSelectedDebugMarket(session.markets[0]);
    }
    setDebugContextOpen(true);
    await loadDebugContext(selectedDebugMarket);
  }}
>
  🔍 View AI Context
</Button>
```

**d) Enhanced Modal Content** (Lines ~1256-1305)

**Better Error Display**:
```typescript
{debugContext?.error ? (
  <div className="py-8 px-4">
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
      <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
        Error Loading AI Context
      </h3>
      <p className="text-sm text-red-700 dark:text-red-300 mb-2">
        {debugContext.error}
      </p>
      {debugContext.statusCode && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Status Code: {debugContext.statusCode}
        </p>
      )}
      {debugContext.details && (
        <details className="mt-2">
          <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer">
            Technical Details
          </summary>
          <pre className="mt-2 text-xs bg-red-100 dark:bg-red-900/30 p-2 rounded overflow-x-auto">
            {debugContext.details}
          </pre>
        </details>
      )}
    </div>
  </div>
) : ...
```

**Session Markets Display + Dropdown**:
```typescript
<h3 className="font-semibold mb-2">Strategy: {debugContext.strategyName}</h3>
{debugContext.sessionMarkets && debugContext.sessionMarkets.length > 0 && (
  <div className="space-y-2">
    <p className="text-sm text-muted-foreground">
      Session Markets: {debugContext.sessionMarkets.join(", ")}
    </p>
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Selected Market:</label>
      <select
        className="border rounded px-2 py-1 text-sm bg-background"
        value={selectedDebugMarket || debugContext.selectedMarket || debugContext.sessionMarkets[0]}
        onChange={async (e) => {
          const newMarket = e.target.value;
          setSelectedDebugMarket(newMarket);
          await loadDebugContext(newMarket);
        }}
      >
        {debugContext.sessionMarkets.map((m: string) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  </div>
)}
```

---

## Key Features

### ✅ Multi-Market Support
- Shows all session markets at top of modal
- Dropdown to select which market to view
- Real-time reload when market selection changes

### ✅ Accurate Context Display
- Backend now accepts `?market=ETH-PERP` query parameter
- Returns context for the selected market
- Falls back to first market if invalid market requested

### ✅ Better Error Handling
- Clear error messages with status codes
- Expandable technical details for debugging
- Handles network errors, 404s, and API errors gracefully

### ✅ Educational Note
- Explains that AI processes **one market per tick** (not all)
- Notes the **round-robin rotation** behavior
- Helps users understand why they're seeing single-market context

---

## Files Changed

| File | Changes |
|------|---------|
| `app/api/sessions/[id]/debug-context/route.ts` | ✅ Accept `?market=` param<br>✅ Return `sessionMarkets` array<br>✅ Return `selectedMarket`<br>✅ Enhanced logging<br>✅ Better error notes |
| `app/dashboard/sessions/[id]/page.tsx` | ✅ Add `selectedDebugMarket` state<br>✅ Create `loadDebugContext()` helper<br>✅ Update button click handler<br>✅ Enhance modal UI with dropdown<br>✅ Improve error display |

---

## How to Verify

### 1. Start a Multi-Market Session

**Strategy Configuration**:
- Markets: `["BTC-PERP", "ETH-PERP", "SOL-PERP"]`

### 2. Open AI Context Debug Modal

1. Navigate to session page
2. Click **"🔍 View AI Context"** button
3. Modal should open without errors

### 3. Verify Network Request

**Chrome DevTools → Network Tab**:
```
✅ GET /api/sessions/<session-id>/debug-context
Status: 200 OK
```

**Response JSON**:
```json
{
  "sessionId": "...",
  "strategyName": "My Strategy",
  "sessionMarkets": ["BTC-PERP", "ETH-PERP", "SOL-PERP"],  // ✅ All markets
  "selectedMarket": "BTC-PERP",                           // ✅ Current selection
  "market": "BTC-PERP",                                   // ✅ Backward compat
  "aiInputsConfigured": { ... },
  "contextSentToAI": {
    "market": "BTC-PERP",                                 // ✅ Matches selection
    "marketData": { ... },
    ...
  },
  "fullPrompt": { ... },
  "note": "This shows what would be sent to the AI for a single market. The AI processes one market per tick in round-robin fashion."
}
```

### 4. Verify UI Display

**Modal Should Show**:
```
Strategy: My Strategy
Session Markets: BTC-PERP, ETH-PERP, SOL-PERP
Selected Market: [BTC-PERP ▼]

AI Inputs Configured:
{ ... }

Context Sent to AI:
{
  "market": "BTC-PERP",
  ...
}
```

### 5. Test Market Switching

**Steps**:
1. Click dropdown → select **"ETH-PERP"**
2. Modal shows "Loading..."
3. Content refreshes with ETH-PERP context

**Verify Network**:
```
✅ GET /api/sessions/<session-id>/debug-context?market=ETH-PERP
Status: 200 OK
```

**Verify Response**:
```json
{
  "selectedMarket": "ETH-PERP",
  "contextSentToAI": {
    "market": "ETH-PERP",  // ✅ Shows ETH now
    ...
  }
}
```

**Verify UI**:
```
Context Sent to AI:
{
  "market": "ETH-PERP",  // ✅ Changed to ETH
  "marketData": {
    "market": "ETH-PERP",
    "price": 3456.78,     // ✅ ETH price, not BTC
    ...
  }
}
```

### 6. Test SOL-PERP

Repeat for SOL-PERP:
```
Selected Market: [SOL-PERP ▼]

Context Sent to AI:
{
  "market": "SOL-PERP",
  "marketData": {
    "market": "SOL-PERP",
    "price": 123.45,  // ✅ SOL price
    ...
  }
}
```

### 7. Test Error Handling

**Simulate 404**:
- Manually call `/api/sessions/invalid-id/debug-context`
- Should show red error box with status code

**Simulate Invalid Market**:
- Call `/api/sessions/<id>/debug-context?market=INVALID-PERP`
- Should fallback to first market (BTC-PERP)
- Note should show: "⚠️ Requested market 'INVALID-PERP' not found..."

---

## Console Logs (Backend)

When debugging, you'll see:
```
[Debug Context] Session markets: [BTC-PERP, ETH-PERP, SOL-PERP]
[Debug Context] Requested market: ETH-PERP
[Debug Context] Showing context for: ETH-PERP
```

---

## Success Criteria

✅ **No 404 errors** when opening modal  
✅ **All markets listed** in "Session Markets"  
✅ **Dropdown shows all markets** (BTC, ETH, SOL)  
✅ **Switching markets reloads context** for selected market  
✅ **Network tab shows 200 OK** with correct `?market=` param  
✅ **Context includes correct market data** (price, candles, etc. for selected market)  
✅ **Errors display clearly** with status codes and details  
✅ **Educational note explains round-robin** behavior  

---

## Technical Notes

### Why One Market Per Tick?

**Cost Optimization**:
- Running AI for all 3 markets per tick = 3× API calls
- Round-robin approach = 1 API call per tick
- Each market still gets evaluated regularly (every 3 ticks for 3 markets)

**Trade-off**:
- ✅ Lower costs
- ✅ Faster tick execution
- ⚠️ Slightly delayed reaction per market (by `cadence × (markets.length - 1)`)

### Query Parameter Format

**Valid Requests**:
```
GET /api/sessions/<id>/debug-context                    → Shows first market (BTC)
GET /api/sessions/<id>/debug-context?market=ETH-PERP   → Shows ETH context
GET /api/sessions/<id>/debug-context?market=SOL-PERP   → Shows SOL context
```

**Invalid Market Handling**:
```
GET /api/sessions/<id>/debug-context?market=INVALID
→ Falls back to first market (BTC-PERP)
→ Response includes warning note
```

---

## Summary

✅ **Backend** now supports `?market=` parameter and returns all session markets  
✅ **Frontend** displays all markets with dropdown for selection  
✅ **UX** clearly shows which market context is displayed  
✅ **Errors** are handled gracefully with detailed messages  
✅ **Documentation** explains round-robin decision engine behavior  

**Result**: Users can now view AI context for any market in their multi-market sessions, with clear understanding of how the system processes markets sequentially.
