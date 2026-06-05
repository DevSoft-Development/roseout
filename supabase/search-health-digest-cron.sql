-- TheOutHaven Search Health daily digest cron.
-- Safe to rerun after replacing placeholders with the production project ref and cron secret.
-- 13:00 UTC is 8:00 AM EST and 9:00 AM EDT; adjust seasonally if exact 8 AM New York delivery is required.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname)
from cron.job
where jobname = 'daily-search-health-digest';

select cron.schedule(
  'daily-search-health-digest',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-search-health-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object(
      'source', 'cron',
      'hours', 24,
      'force', false
    )
  );
  $$
);
