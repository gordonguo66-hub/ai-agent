-- Check the timeline of session creation vs latest decisions
SELECT 
  'SESSION CREATED' as event_type,
  ss.id as session_id,
  ss.mode,
  ss.created_at as timestamp,
  NULL as error
FROM strategy_sessions ss
WHERE ss.id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')

UNION ALL

SELECT 
  'LATEST DECISION' as event_type,
  d.session_id,
  ss.mode,
  d.created_at as timestamp,
  d.error
FROM ai_decisions d
JOIN strategy_sessions ss ON d.session_id = ss.id
WHERE d.session_id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
AND d.created_at = (
  SELECT MAX(created_at) 
  FROM ai_decisions 
  WHERE session_id = d.session_id
)

ORDER BY timestamp DESC;

-- Also check current strategy config
SELECT 
  s.id as strategy_id,
  s.name,
  s.saved_api_key_id,
  CASE 
    WHEN s.api_key_ciphertext IS NULL THEN 'NULL'
    WHEN s.api_key_ciphertext = '' THEN 'EMPTY STRING'
    ELSE 'HAS KEY'
  END as direct_key_status,
  COUNT(DISTINCT ss.id) as session_count
FROM strategies s
LEFT JOIN strategy_sessions ss ON ss.strategy_id = s.id
WHERE ss.id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
GROUP BY s.id, s.name, s.saved_api_key_id, s.api_key_ciphertext;
