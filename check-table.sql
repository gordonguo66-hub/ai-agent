-- Check if user_api_keys table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'user_api_keys';

-- If table exists, check its structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_api_keys'
ORDER BY ordinal_position;

-- Check if saved_api_key_id column was added to strategies
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'strategies'
AND column_name = 'saved_api_key_id';
