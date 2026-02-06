-- Check the actual data types and values in the trades
SELECT 
  id,
  market,
  size,
  price,
  size::text as size_text,
  price::text as price_text,
  pg_typeof(size) as size_type,
  pg_typeof(price) as price_type,
  (size::numeric * price::numeric) as calculated_value
FROM live_trades
WHERE session_id = 'bdd925f6-f370-4cbd-b681-ac0c071ed649'
ORDER BY created_at DESC
LIMIT 1;
