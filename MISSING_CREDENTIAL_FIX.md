# Fix: "Missing credential material" Error in Live Sessions

## Problem
Live sessions were showing "Error: Missing credential material" and skipping all decisions. This occurred when strategies were created using a saved API key from Settings.

## Root Cause
When creating a strategy with a saved API key, the code was setting `api_key_ciphertext = ""` (empty string) instead of `null`. When the session tried to run, the `resolveStrategyApiKey` function would try to decrypt this empty string, causing the `decryptCredential()` function to throw "Missing credential material".

## Files Changed

### 1. `/app/api/strategies/route.ts` (Line 127)
**Before:**
```typescript
insertData.api_key_ciphertext = "";
```

**After:**
```typescript
insertData.api_key_ciphertext = null;
```

### 2. `/app/api/strategies/[id]/route.ts` (Line 147)
**Before:**
```typescript
updateData.api_key_ciphertext = "";
```

**After:**
```typescript
updateData.api_key_ciphertext = null;
```

### 3. `/lib/ai/resolveApiKey.ts`
Added explicit checks for empty string (`=== ""`) in addition to the existing falsy checks, to handle legacy data gracefully.

**Changes:**
- Line 36: Added `&& strategy.api_key_ciphertext !== ""`
- Line 65: Added `|| strategy.api_key_ciphertext === ""`

### 4. `/app/api/sessions/[id]/tick/route.ts` (Line 190)
Made the strategy select explicit to ensure `saved_api_key_id` is included:

**Before:**
```typescript
strategies(*)
```

**After:**
```typescript
strategies(
  id,
  user_id,
  name,
  model_provider,
  model_name,
  prompt,
  filters,
  api_key_ciphertext,
  saved_api_key_id,
  created_at,
  updated_at
)
```

## Database Migration Required

Run the following SQL in your Supabase SQL Editor to fix existing strategies:

```sql
-- Fix strategies with empty string api_key_ciphertext
UPDATE strategies
SET api_key_ciphertext = NULL
WHERE api_key_ciphertext = ''
  AND saved_api_key_id IS NOT NULL;
```

Or run the migration file:
```bash
# In Supabase SQL Editor, run:
supabase/fix_empty_api_keys.sql
```

## How to Test

1. **Run the SQL migration** to fix existing strategies
2. **Refresh your browser** to reload the session
3. **Wait for the next tick** (every 60 seconds by cron, or click "Manual Tick" if available)
4. **Check Decision Log** - should see AI decisions instead of "Missing credential material"

## Expected Behavior After Fix

- ✅ Strategies using saved API keys should resolve the key correctly
- ✅ Strategies using manual API keys should continue working
- ✅ If a saved key is deleted, strategy will show a clear error message instead of "Missing credential material"
- ✅ Sessions should execute AI decisions normally

## Additional Notes

- The fix is backward-compatible with existing strategies
- New strategies will no longer create empty string api_key_ciphertext
- The `resolveStrategyApiKey` function now handles empty strings gracefully
- Explicit column selection in session fetch ensures all necessary fields are loaded
