-- Check which saved API key Test2 is using
SELECT 
  uak.id,
  uak.label,
  uak.provider,
  uak.key_preview,
  uak.created_at,
  COUNT(s.id) as strategies_using_this_key
FROM user_api_keys uak
LEFT JOIN strategies s ON s.saved_api_key_id = uak.id
WHERE uak.id = '3cbc706d-7efe-4bdd-9fa4-b03380271bc1'
GROUP BY uak.id, uak.label, uak.provider, uak.key_preview, uak.created_at;

-- Also show all saved keys for context
SELECT 
  id,
  label,
  provider,
  key_preview,
  created_at
FROM user_api_keys
ORDER BY created_at DESC;

-- Show Test2 strategy's API key configuration
SELECT 
  s.id,
  s.name,
  s.saved_api_key_id,
  uak.label as saved_key_label,
  uak.provider as saved_key_provider,
  uak.key_preview as saved_key_preview
FROM strategies s
LEFT JOIN user_api_keys uak ON s.saved_api_key_id = uak.id
WHERE s.name = 'Test2';
