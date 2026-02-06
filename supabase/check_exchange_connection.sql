-- Check if user has exchange connection
SELECT id, venue, wallet_address, created_at, updated_at
FROM exchange_connections
WHERE user_id = '1dcd67da-d919-407e-a9fb-3345022cb337';

-- Check if session is linked to an exchange connection
SELECT 
  s.id as session_id,
  s.mode,
  s.status,
  la.id as account_id,
  la.starting_equity,
  la.equity,
  ec.wallet_address
FROM strategy_sessions s
LEFT JOIN live_accounts la ON s.id = la.session_id
LEFT JOIN exchange_connections ec ON s.user_id = ec.user_id
WHERE s.id = 'abbe876e-6641-490e-9e65-0937b27b7026';
