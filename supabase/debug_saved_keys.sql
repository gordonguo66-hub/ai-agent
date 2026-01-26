-- Debug: Check if saved API keys exist and are properly linked

-- Check saved API keys
SELECT 
  uak.id as key_id,
  uak.label,
  uak.provider,
  uak.key_preview,
  uak.user_id,
  CASE 
    WHEN uak.encrypted_key IS NULL THEN 'NULL'
    WHEN uak.encrypted_key = '' THEN 'EMPTY STRING'
    WHEN LENGTH(uak.encrypted_key) > 0 THEN 'HAS VALUE (length: ' || LENGTH(uak.encrypted_key) || ')'
  END as encrypted_key_status,
  uak.created_at
FROM user_api_keys uak
ORDER BY uak.created_at DESC
LIMIT 10;

-- Check strategies referencing saved keys
SELECT 
  s.id as strategy_id,
  s.name as strategy_name,
  s.saved_api_key_id,
  uak.label as saved_key_label,
  uak.provider as saved_key_provider,
  s.model_provider as strategy_provider,
  CASE 
    WHEN uak.id IS NULL THEN '❌ SAVED KEY MISSING'
    WHEN uak.provider != s.model_provider THEN '⚠️ PROVIDER MISMATCH'
    ELSE '✅ OK'
  END as validation_status
FROM strategies s
LEFT JOIN user_api_keys uak ON uak.id = s.saved_api_key_id
WHERE s.saved_api_key_id IS NOT NULL
ORDER BY s.created_at DESC
LIMIT 10;
