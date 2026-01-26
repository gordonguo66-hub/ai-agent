-- Check all saved API keys
SELECT 
  id,
  label,
  provider,
  key_preview,
  CASE 
    WHEN encrypted_key IS NULL THEN '❌ NULL'
    WHEN encrypted_key = '' THEN '❌ EMPTY'
    ELSE '✅ HAS DATA'
  END as status
FROM user_api_keys
ORDER BY created_at DESC;

-- Check which saved_api_key_id the strategies are using
SELECT 
  s.id as strategy_id,
  s.name as strategy_name,
  s.saved_api_key_id,
  uak.label as referenced_key_label,
  uak.provider as referenced_key_provider,
  CASE 
    WHEN uak.id IS NULL THEN '❌ KEY DOES NOT EXIST'
    WHEN uak.encrypted_key IS NULL OR uak.encrypted_key = '' THEN '❌ KEY HAS NO DATA'
    ELSE '✅ OK'
  END as validation
FROM strategies s
LEFT JOIN user_api_keys uak ON uak.id = s.saved_api_key_id
WHERE s.saved_api_key_id IS NOT NULL;
