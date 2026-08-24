-- TheOutHaven Search Health daily digest cron.
-- Safe to rerun after replacing placeholders with the production project ref and cron secret.
-- This intentionally fires at both possible UTC equivalents of 6:30 AM America/New_York.
-- The Edge Function sends only when New York local time is actually 6:30 AM, so DST is handled automatically.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname)
from cron.job
where jobname = 'daily-search-health-digest';

select cron.schedule(
  'daily-search-health-digest',
  '30 10,11 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-search-health-digest',
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
