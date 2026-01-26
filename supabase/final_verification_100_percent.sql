-- 100% VERIFICATION: Ensure "Missing credential material" can NEVER happen again

-- 1. CHECK: Are there ANY strategies with empty string api_key_ciphertext?
-- Expected: 0 rows (all should be NULL or valid encrypted key)
SELECT 
  id,
  name,
  saved_api_key_id,
  api_key_ciphertext,
  CASE 
    WHEN api_key_ciphertext = '' THEN '❌ EMPTY STRING (BUG!)'
    WHEN api_key_ciphertext IS NULL AND saved_api_key_id IS NOT NULL THEN '✅ Using saved key (NULL is correct)'
    WHEN api_key_ciphertext IS NULL AND saved_api_key_id IS NULL THEN '⚠️ NO KEY AT ALL'
    WHEN api_key_ciphertext IS NOT NULL AND api_key_ciphertext != '' THEN '✅ Using direct key'
    ELSE '❓ Unknown state'
  END as status
FROM strategies
WHERE api_key_ciphertext = '' 
   OR (api_key_ciphertext IS NULL AND saved_api_key_id IS NULL);

-- If this returns ANY rows with '❌ EMPTY STRING' - we have a problem!
-- If this returns rows with '⚠️ NO KEY AT ALL' - those strategies won't work until user adds a key


-- 2. CHECK: All saved API keys have encrypted_key
-- Expected: All rows should show '✅ Has encrypted key'
SELECT 
  id,
  label,
  provider,
  CASE 
    WHEN encrypted_key IS NULL OR encrypted_key = '' THEN '❌ MISSING KEY'
    ELSE '✅ Has encrypted key'
  END as key_status,
  LENGTH(encrypted_key) as key_length
FROM user_api_keys
WHERE encrypted_key IS NULL OR encrypted_key = '';

-- If this returns ANY rows - we have saved keys without actual keys!


-- 3. CHECK: All running sessions have valid API key setup
-- Expected: All should show '✅ Valid key setup'
SELECT 
  ss.id as session_id,
  ss.mode,
  ss.status,
  s.name as strategy_name,
  s.saved_api_key_id,
  s.api_key_ciphertext,
  CASE 
    WHEN s.api_key_ciphertext = '' THEN '❌ EMPTY STRING'
    WHEN s.saved_api_key_id IS NOT NULL THEN '✅ Using saved key'
    WHEN s.api_key_ciphertext IS NOT NULL AND s.api_key_ciphertext != '' THEN '✅ Using direct key'
    ELSE '❌ NO KEY'
  END as key_status,
  -- Check if saved key exists
  CASE 
    WHEN s.saved_api_key_id IS NOT NULL AND 
         EXISTS (SELECT 1 FROM user_api_keys WHERE id = s.saved_api_key_id) 
    THEN '✅ Saved key exists'
    WHEN s.saved_api_key_id IS NOT NULL AND 
         NOT EXISTS (SELECT 1 FROM user_api_keys WHERE id = s.saved_api_key_id)
    THEN '❌ Saved key DELETED'
    ELSE 'N/A'
  END as saved_key_exists
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
WHERE ss.status IN ('running', 'active')
ORDER BY ss.created_at DESC;

-- If ANY session shows '❌ EMPTY STRING' or '❌ NO KEY' or '❌ Saved key DELETED' - that session will fail!


-- 4. CHECK: Recent decisions - are there still errors?
-- Expected: No "Missing credential material" errors in last hour
SELECT 
  ss.id as session_id,
  s.name as strategy_name,
  sd.created_at,
  sd.error,
  sd.action_summary
FROM session_decisions sd
JOIN strategy_sessions ss ON sd.session_id = ss.id
JOIN strategies s ON ss.strategy_id = s.id
WHERE sd.error LIKE '%Missing credential%'
  AND sd.created_at > NOW() - INTERVAL '1 hour'
ORDER BY sd.created_at DESC
LIMIT 20;

-- If this returns ANY rows - the error is still happening!


-- ✅ EXPECTED RESULTS FOR 100% FIX:
-- Query 1: 0 rows (no empty strings)
-- Query 2: 0 rows (all saved keys have encrypted_key)
-- Query 3: All rows show '✅ Valid key setup' + '✅ Saved key exists' or '✅ Using direct key'
-- Query 4: 0 rows (no recent errors)
