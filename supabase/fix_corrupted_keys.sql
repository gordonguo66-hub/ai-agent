-- Fix corrupted encrypted API keys
-- Run this in Supabase SQL Editor

-- Option 1: Delete the corrupted saved keys (strategies will fall back to their direct keys)
DELETE FROM user_api_keys 
WHERE label = 'Main' 
AND provider_name = 'DeepSeek';

-- Option 2: If you need to keep strategies using saved keys,
-- update strategies to NOT reference saved keys temporarily
-- UPDATE strategies 
-- SET saved_api_key_id = NULL 
-- WHERE saved_api_key_id IN (
--   SELECT id FROM user_api_keys WHERE label = 'Main' AND provider_name = 'DeepSeek'
-- );

-- After running this, go to Settings and add your DeepSeek key again
-- It will be encrypted with the correct key this time
