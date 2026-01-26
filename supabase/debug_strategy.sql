-- Debug: Check the strategy being used by this session
-- This will show us the actual api_key_ciphertext and saved_api_key_id values

SELECT 
  s.id as strategy_id,
  s.name as strategy_name,
  s.user_id,
  s.model_provider,
  CASE 
    WHEN s.api_key_ciphertext IS NULL THEN 'NULL'
    WHEN s.api_key_ciphertext = '' THEN 'EMPTY STRING'
    WHEN LENGTH(s.api_key_ciphertext) > 0 THEN 'HAS VALUE (length: ' || LENGTH(s.api_key_ciphertext) || ')'
  END as api_key_status,
  s.saved_api_key_id,
  CASE 
    WHEN s.saved_api_key_id IS NOT NULL THEN 'Using saved key'
    WHEN s.api_key_ciphertext IS NOT NULL AND s.api_key_ciphertext != '' THEN 'Using direct key'
    ELSE 'NO KEY CONFIGURED'
  END as key_source,
  ss.id as session_id,
  ss.status as session_status,
  ss.mode as session_mode
FROM strategies s
JOIN strategy_sessions ss ON ss.strategy_id = s.id
WHERE ss.status = 'running'
ORDER BY ss.created_at DESC
LIMIT 5;
