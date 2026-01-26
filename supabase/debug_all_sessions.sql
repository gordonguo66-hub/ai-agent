-- Debug: Check all sessions and their strategies
SELECT 
  ss.id as session_id,
  ss.mode as session_mode,
  ss.status as session_status,
  s.id as strategy_id,
  s.name as strategy_name,
  s.model_provider,
  CASE 
    WHEN s.api_key_ciphertext IS NULL THEN '✅ NULL (using saved key)'
    WHEN s.api_key_ciphertext = '' THEN '❌ EMPTY STRING (BAD)'
    WHEN LENGTH(s.api_key_ciphertext) > 0 THEN '✅ HAS DIRECT KEY'
  END as direct_key_status,
  CASE 
    WHEN s.saved_api_key_id IS NOT NULL THEN '✅ ' || uak.label || ' (' || uak.provider || ')'
    ELSE '❌ NO SAVED KEY'
  END as saved_key_status,
  CASE 
    WHEN uak.encrypted_key IS NULL THEN '❌ SAVED KEY EMPTY'
    WHEN uak.encrypted_key = '' THEN '❌ SAVED KEY EMPTY STRING'
    WHEN LENGTH(uak.encrypted_key) > 0 THEN '✅ SAVED KEY EXISTS (length: ' || LENGTH(uak.encrypted_key) || ')'
    ELSE 'N/A'
  END as saved_key_data_status
FROM strategy_sessions ss
JOIN strategies s ON s.id = ss.strategy_id
LEFT JOIN user_api_keys uak ON uak.id = s.saved_api_key_id
WHERE ss.status = 'running'
ORDER BY ss.created_at DESC;
