-- Check if virtual session f9196654-85c1-4bee-b8eb-eb8def339eec has credential issues

-- 1. Check the session's strategy and its API key status
SELECT 
  ss.id as session_id,
  ss.mode,
  ss.status,
  s.id as strategy_id,
  s.name as strategy_name,
  s.saved_api_key_id,
  CASE 
    WHEN s.api_key_ciphertext IS NULL THEN '❌ NULL'
    WHEN s.api_key_ciphertext = '' THEN '❌ EMPTY STRING'
    WHEN LENGTH(s.api_key_ciphertext) > 0 THEN '✅ HAS KEY (len=' || LENGTH(s.api_key_ciphertext) || ')'
    ELSE '⚠️ UNKNOWN'
  END as direct_key_status,
  CASE
    WHEN s.saved_api_key_id IS NULL THEN 'No saved key'
    ELSE 'Using saved key: ' || s.saved_api_key_id
  END as saved_key_info
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
WHERE ss.id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';

-- 2. If using saved key, check if it exists and is valid
SELECT 
  ss.id as session_id,
  s.name as strategy_name,
  s.saved_api_key_id,
  uak.id as saved_key_id,
  uak.label as key_label,
  uak.provider,
  CASE 
    WHEN uak.encrypted_key IS NULL THEN '❌ NULL'
    WHEN uak.encrypted_key = '' THEN '❌ EMPTY STRING'
    WHEN LENGTH(uak.encrypted_key) > 0 THEN '✅ HAS KEY (len=' || LENGTH(uak.encrypted_key) || ')'
    ELSE '⚠️ UNKNOWN'
  END as encrypted_key_status,
  uak.created_at as key_created_at
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
LEFT JOIN user_api_keys uak ON uak.id = s.saved_api_key_id
WHERE ss.id = 'f9196654-85c1-4bee-b8eb-eb8def339eec';

-- 3. Check recent decision errors for this session
SELECT 
  created_at,
  error,
  ai_bias,
  confidence
FROM strategy_decisions
WHERE session_id = 'f9196654-85c1-4bee-b8eb-eb8def339eec'
ORDER BY created_at DESC
LIMIT 5;
