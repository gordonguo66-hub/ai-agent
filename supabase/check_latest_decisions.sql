-- Check the latest decision log entries for both sessions
SELECT 
  session_id,
  market,
  bias,
  confidence,
  action,
  error,
  created_at,
  TO_CHAR(created_at, 'HH24:MI:SS') as time
FROM ai_decisions
WHERE session_id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd')
ORDER BY created_at DESC
LIMIT 20;

-- Also check the session details
SELECT 
  ss.id,
  ss.mode,
  ss.strategy_id,
  ss.last_tick_at,
  TO_CHAR(ss.last_tick_at, 'HH24:MI:SS') as last_tick_time,
  s.saved_api_key_id,
  s.api_key_ciphertext IS NOT NULL as has_direct_key,
  s.api_key_ciphertext as direct_key_cipher,
  length(s.api_key_ciphertext) as key_length
FROM strategy_sessions ss
JOIN strategies s ON ss.strategy_id = s.id
WHERE ss.id IN ('f9196654-85c1-4bee-b8eb-eb8def339eec', 'feee2479-b1ab-4205-9def-a3a05f1ac1cd');
