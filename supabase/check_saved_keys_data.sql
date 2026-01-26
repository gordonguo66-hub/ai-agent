-- Debug: Check if saved API keys have actual encrypted data
SELECT 
  uak.id,
  uak.label,
  uak.provider,
  uak.key_preview,
  CASE 
    WHEN uak.encrypted_key IS NULL THEN '❌ NULL'
    WHEN uak.encrypted_key = '' THEN '❌ EMPTY STRING'
    WHEN LENGTH(uak.encrypted_key) < 20 THEN '⚠️ TOO SHORT (length: ' || LENGTH(uak.encrypted_key) || ')'
    ELSE '✅ HAS DATA (length: ' || LENGTH(uak.encrypted_key) || ')'
  END as encrypted_key_status,
  SUBSTRING(uak.encrypted_key, 1, 10) as encrypted_key_preview,
  uak.created_at
FROM user_api_keys uak
ORDER BY uak.created_at DESC
LIMIT 10;
