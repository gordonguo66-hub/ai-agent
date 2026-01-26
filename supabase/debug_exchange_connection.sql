-- Debug: Check exchange connection for live trading
SELECT 
  id,
  user_id,
  wallet_address,
  CASE 
    WHEN key_material_encrypted IS NULL THEN '❌ NULL - NO KEY'
    WHEN key_material_encrypted = '' THEN '❌ EMPTY STRING - NO KEY'
    WHEN LENGTH(key_material_encrypted) > 0 THEN '✅ HAS KEY (length: ' || LENGTH(key_material_encrypted) || ')'
  END as key_status,
  created_at,
  updated_at
FROM exchange_connections
ORDER BY created_at DESC
LIMIT 5;
