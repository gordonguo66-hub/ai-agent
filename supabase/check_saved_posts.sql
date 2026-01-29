-- Check if saved_posts table exists and has data
SELECT 
  sp.id,
  sp.user_id,
  sp.post_id,
  sp.created_at,
  p.title as post_title,
  prof.display_name as saved_by
FROM saved_posts sp
LEFT JOIN posts p ON p.id = sp.post_id
LEFT JOIN profiles prof ON prof.id = sp.user_id
ORDER BY sp.created_at DESC
LIMIT 20;

-- Also check the table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'saved_posts';
