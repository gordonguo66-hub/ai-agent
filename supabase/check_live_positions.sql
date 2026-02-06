-- Check if positions exist for this live account
SELECT id, account_id, market, side, size, avg_entry, unrealized_pnl, updated_at
FROM live_positions  
WHERE account_id = '36b32510-1e68-4732-914e-81aca6b9646e'
ORDER BY updated_at DESC;

-- Check when position sync last ran
SELECT NOW() as current_time;
