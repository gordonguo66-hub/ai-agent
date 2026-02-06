-- Check the actual equity value in the database right now
SELECT 
  id,
  user_id,
  starting_equity,
  equity,
  cash_balance,
  updated_at
FROM live_accounts
WHERE id = '36b32510-1e68-4732-914e-81aca6b9646e';

-- Check when it was last updated
SELECT NOW() as current_time;
