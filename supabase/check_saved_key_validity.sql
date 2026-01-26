-- Check if the saved API key "Main" is valid

SELECT 
  id,
  label,
  provider,
  key_preview,
  CASE 
    WHEN encrypted_key IS NULL THEN '❌ NULL (BROKEN!)'
    WHEN encrypted_key = '' THEN '❌ EMPTY STRING (BROKEN!)'
    WHEN LENGTH(encrypted_key) > 0 THEN '✅ VALID (len=' || LENGTH(encrypted_key) || ')'
    ELSE '⚠️ UNKNOWN'
  END as encrypted_key_status,
  created_at,
  updated_at
FROM user_api_keys
WHERE id = '3cbc706d-7efe-4bdd-9fa4-b03380271bc1';
