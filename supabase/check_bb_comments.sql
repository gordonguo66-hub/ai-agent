-- Check all comments for the "bb" post
SELECT 
  c.id,
  c.body,
  c.created_at,
  c.parent_comment_id,
  c.user_id,
  p.display_name as author_name
FROM comments c
LEFT JOIN profiles p ON p.id = c.user_id
WHERE c.post_id = 'aecff6cd-3255-429a-bc3f-8d9d26bba5b0'
ORDER BY c.created_at ASC;

-- Count total
SELECT COUNT(*) as total_count
FROM comments
WHERE post_id = 'aecff6cd-3255-429a-bc3f-8d9d26bba5b0';
