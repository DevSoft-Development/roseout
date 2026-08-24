-- TheOutHaven Daily Marketing Pulse cron.
-- Fires at both possible UTC equivalents of 7:30 AM America/New_York.
-- The Edge Function sends only when New York local time is actually 7:30 AM,
-- so daylight-saving transitions do not duplicate the email.

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
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object(
      'source', 'cron',
      'force', false
    )
  );
  $$
);
