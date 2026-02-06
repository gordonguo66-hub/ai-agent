-- Check if session has a valid strategy relationship
SELECT 
  s.id as session_id,
  s.strategy_id,
  s.status,
  s.mode,
  st.id as strategy_exists,
  st.name as strategy_name
FROM strategy_sessions s
LEFT JOIN strategies st ON s.strategy_id = st.id
WHERE s.id = 'bdd925f6-f370-4cbd-b681-ac0c071ed649';
