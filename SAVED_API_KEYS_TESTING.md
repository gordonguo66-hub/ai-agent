# Saved API Keys - Testing Guide

## Overview
This feature allows users to save API keys in Settings once, then reuse them across multiple strategies without pasting the key every time.

## Database Migration
Before testing, run the database migration:

```bash
# Connect to your Supabase project and run:
psql -h [YOUR_SUPABASE_HOST] -U postgres -d postgres -f supabase/user_api_keys.sql
```

Or run the SQL in the Supabase SQL Editor:
- Open Supabase Dashboard → SQL Editor
- Paste contents of `supabase/user_api_keys.sql`
- Click "Run"

## Manual Testing Steps

### 1. Save an API Key in Settings

1. Navigate to `/settings`
2. Find the "Saved API Keys" section
3. Click **"Add New Key"**
4. Fill in:
   - **Provider**: Select a provider (e.g., DeepSeek, OpenAI, Anthropic)
   - **Label**: Give it a name (e.g., "Main DeepSeek Key")
   - **API Key**: Paste your actual API key
5. Click **"Save Key"**
6. Verify:
   - Key appears in the table
   - Only last 4 characters are shown (e.g., `****abcd`)
   - Created date is displayed
   - You can see the provider badge

### 2. Create a Strategy Using a Saved Key

1. Navigate to `/strategy/new`
2. Fill in strategy details:
   - **Name**: Test Strategy
   - **Model Provider**: Select the same provider as your saved key (e.g., DeepSeek)
   - **Model**: Select any model for that provider
3. In the "API Key" section:
   - You should see a dropdown with your saved key(s)
   - The dropdown should show: `[Label] ([Preview])`
   - Below it should be an option: `✎ Manual / Paste Key`
4. **Select your saved key** from the dropdown
5. Verify:
   - A green checkmark appears: "Using saved key - no need to paste"
   - The manual API key input is hidden
6. Fill in the rest of the form (prompt, markets, etc.)
7. Click **"Create Strategy"**
8. Verify strategy is created successfully

### 3. Verify Strategy Execution

1. Go to the strategy detail page
2. Click **"Start Session"** (Virtual mode is fine)
3. Wait for a tick to occur (or manually trigger one)
4. Verify:
   - Session runs without errors
   - AI decisions are being made
   - Check browser console for any API key-related errors
   - Strategy should use the saved key transparently

### 4. Test Manual Key Fallback

1. Create another strategy with the **same provider**
2. This time, in the API Key dropdown, select **"✎ Manual / Paste Key"**
3. Paste an API key directly
4. Save the strategy
5. Verify:
   - Strategy is created
   - Manual key is used (not saved key)
   - Strategy still executes correctly

### 5. Test Saved Key Deletion

1. Go back to `/settings`
2. Find your saved key in the list
3. Click **"Delete"**
4. Confirm the deletion
5. Check if any strategies were using that key:
   - If yes, you should see a message listing affected strategies
6. Go to a strategy that was using the deleted key
7. Try to run it:
   - Should show an error about missing saved key
8. Edit the strategy:
   - Dropdown should show "Manual / Paste Key" as selected (automatic fallback)
   - Add a new key (saved or manual) and save
9. Verify strategy works again after updating

### 6. Test Provider Mismatch

1. Save a key for Provider A (e.g., DeepSeek)
2. Try to create/edit a strategy for Provider B (e.g., OpenAI)
3. Verify:
   - Saved keys dropdown only shows keys for Provider B
   - Keys for Provider A are not visible
4. If you change the Model Provider:
   - Dropdown should automatically update to show only keys for the new provider
   - Previously selected saved key should reset

### 7. Test Edit Mode

1. Edit an existing strategy that uses a saved key
2. Verify:
   - The saved key dropdown shows the currently selected key
   - You can switch to another saved key
   - You can switch to manual key
   - Changes are saved correctly

## Expected Security Behaviors

1. **Encryption**: Keys are encrypted server-side using AES-256-GCM
2. **RLS**: Users can only see/delete their own saved keys
3. **Validation**: Saved keys are validated to belong to the user before use
4. **Provider Match**: Strategy provider must match saved key provider

## API Endpoints

### List Saved Keys
```
GET /api/settings/api-keys
Authorization: Bearer [token]

Response:
{
  "keys": [
    {
      "id": "uuid",
      "provider": "deepseek",
      "label": "Main Key",
      "key_preview": "****abcd",
      "created_at": "2026-01-25T..."
    }
  ]
}
```

### Create Saved Key
```
POST /api/settings/api-keys
Authorization: Bearer [token]
Content-Type: application/json

Body:
{
  "provider": "deepseek",
  "label": "Main Key",
  "api_key": "sk-..."
}

Response:
{
  "key": {
    "id": "uuid",
    "provider": "deepseek",
    "label": "Main Key",
    "key_preview": "****abcd",
    "created_at": "2026-01-25T..."
  }
}
```

### Delete Saved Key
```
DELETE /api/settings/api-keys/[id]
Authorization: Bearer [token]

Response:
{
  "success": true,
  "message": "Key deleted successfully",
  "affectedStrategies": []
}
```

## Troubleshooting

### "Invalid saved API key"
- Key was deleted
- Edit strategy to select a new key

### "Saved key is for X, but strategy uses Y"
- Provider mismatch
- Edit strategy to select a key for the correct provider

### "Failed to decrypt saved API key"
- `CREDENTIALS_ENCRYPTION_KEY` environment variable not set
- Check `.env.local` on server

### Keys not showing in dropdown
- Check browser console for fetch errors
- Verify RLS policies are applied
- Ensure user is authenticated

## Database Schema

```sql
-- user_api_keys table
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider, label)
);

-- strategies.saved_api_key_id (nullable FK)
ALTER TABLE strategies 
ADD COLUMN saved_api_key_id UUID REFERENCES user_api_keys(id) ON DELETE SET NULL;
```

## Files Modified

### Database
- `supabase/user_api_keys.sql` - Migration for new table and FK

### Backend API
- `app/api/settings/api-keys/route.ts` - List/Create saved keys
- `app/api/settings/api-keys/[id]/route.ts` - Delete saved keys
- `app/api/strategies/route.ts` - Handle saved_api_key_id on create
- `app/api/strategies/[id]/route.ts` - Handle saved_api_key_id on update
- `app/api/paper-run/route.ts` - Use resolveStrategyApiKey
- `app/api/sessions/[id]/tick/route.ts` - Use resolveStrategyApiKey
- `lib/ai/resolveApiKey.ts` - Helper to resolve saved keys

### Frontend UI
- `app/settings/page.tsx` - Saved API Keys management UI
- `components/strategy-form.tsx` - Saved key dropdown + manual fallback

## Success Criteria

✅ User can save API keys in Settings  
✅ User can see list of saved keys (masked)  
✅ User can delete saved keys  
✅ Strategy form shows dropdown of saved keys filtered by provider  
✅ Strategy can use saved key without pasting  
✅ Strategy can still use manual key as fallback  
✅ LLM calls resolve saved keys correctly  
✅ Deleted keys trigger appropriate warnings  
✅ Existing strategies without saved keys continue to work  

## Notes

- Keys are never displayed after saving (security best practice)
- Strategies reference saved keys by ID, not by copying the key
- If saved key is deleted, strategies fall back to their own `api_key_ciphertext` (if present)
- Provider mismatch is prevented at both UI and API level
- All key operations are scoped to the authenticated user via RLS

---

**Feature Complete! 🎉**

Ready for production deployment after successful testing.
