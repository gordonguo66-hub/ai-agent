-- Find the correct table names
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (
    table_name LIKE '%position%' 
    OR table_name LIKE '%trade%'
    OR table_name LIKE '%account%'
  )
ORDER BY table_name;
