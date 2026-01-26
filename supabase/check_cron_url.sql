-- Check where the cron job is sending tick requests
-- This will show if it's hitting localhost or a deployed Vercel URL

SELECT 
  jobid,
  schedule,
  command,
  active,
  jobname
FROM cron.job
WHERE command LIKE '%tick%' OR command LIKE '%session%';

-- If the command shows a Vercel URL instead of localhost:3000,
-- that explains why we don't see logs on your local server!
