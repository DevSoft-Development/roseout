-- TheOutHaven Daily Marketing Pulse cron.
-- Fires at both UTC equivalents of 7:30 AM America/New_York.
-- The Edge Function applies the New York local-time guard so DST never creates duplicate delivery.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname)
from cron.job
where jobname = 'daily-marketing-pulse';

select cron.schedule(
  'daily-marketing-pulse',
  '30 11,12 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-daily-marketing-pulse',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_OR_SERVICE_JWT',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object(
      'source', 'cron',
      'force', false
    )
  );
  $$
);
