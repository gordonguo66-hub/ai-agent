-- Check the posts table schema to find the correct author column name
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'posts'
ORDER BY ordinal_position;
