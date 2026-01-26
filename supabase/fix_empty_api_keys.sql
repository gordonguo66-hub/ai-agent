-- Migration: Fix strategies with empty string api_key_ciphertext
-- This fixes strategies that were created with saved API keys and have api_key_ciphertext set to ""
-- instead of null, which was causing "Missing credential material" errors.

-- Step 1: Drop existing constraint if it exists (to avoid conflict)
ALTER TABLE strategies 
DROP CONSTRAINT IF EXISTS strategies_must_have_api_key;

-- Step 2: Make api_key_ciphertext nullable (since strategies can use saved keys instead)
ALTER TABLE strategies 
ALTER COLUMN api_key_ciphertext DROP NOT NULL;

-- Step 3: Update strategies with empty string api_key_ciphertext to null
UPDATE strategies
SET api_key_ciphertext = NULL
WHERE api_key_ciphertext = '';

-- Step 4: Show results
SELECT 
  COUNT(*) as total_strategies_using_saved_keys,
  'These strategies now use saved API keys only' as description
FROM strategies
WHERE api_key_ciphertext IS NULL
  AND saved_api_key_id IS NOT NULL;

-- Step 5: Add a check constraint to ensure strategies have at least one key source
-- (Either saved_api_key_id OR api_key_ciphertext must be present)
ALTER TABLE strategies
ADD CONSTRAINT strategies_must_have_api_key 
CHECK (
  (saved_api_key_id IS NOT NULL) OR 
  (api_key_ciphertext IS NOT NULL AND api_key_ciphertext != '')
);
