-- Fix corrupted saved API keys for a specific user
-- Run this if a user can't delete their saved API keys

-- Step 1: Find strategies that would be orphaned (no API key at all)
SELECT 
  s.id,
  s.name,
  s.saved_api_key_id,
  k.label as saved_key_label,
  LENGTH(COALESCE(s.api_key_ciphertext, '')) as has_fallback_key
FROM strategies s
LEFT JOIN user_api_keys k ON s.saved_api_key_id = k.id
WHERE s.user_id = 'YOUR_USER_ID_HERE' -- Replace with actual user ID
  AND s.saved_api_key_id IS NOT NULL
  AND (s.api_key_ciphertext IS NULL OR s.api_key_ciphertext = '');

-- Step 2: Update these strategies to NOT use saved keys (null out saved_api_key_id)
-- This allows the user to delete the saved key
-- WARNING: These strategies will need manual API keys added!
UPDATE strategies
SET saved_api_key_id = NULL
WHERE user_id = 'YOUR_USER_ID_HERE' -- Replace with actual user ID
  AND saved_api_key_id IS NOT NULL
  AND (api_key_ciphertext IS NULL OR api_key_ciphertext = '');

-- Step 3: Now the user can delete their corrupted saved API keys
DELETE FROM user_api_keys
WHERE user_id = 'YOUR_USER_ID_HERE' -- Replace with actual user ID
  AND label = 'Main'; -- Or specific label

-- Step 4: After deletion, the user must:
-- 1. Go to Settings and add their API key again (will encrypt properly)
-- 2. Edit each affected strategy and select the new saved key or paste the key directly
