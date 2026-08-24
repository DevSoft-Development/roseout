-- TheOutHaven Platform Error Digest daily cron.
-- Fires at both UTC equivalents of 6:15 AM America/New_York.
-- The Edge Function applies the New York local-time guard so DST never creates duplicate delivery.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname)
from cron.job
where jobname = 'daily-platform-error-digest';

select cron.schedule(
  'daily-platform-error-digest',
  '15 10,11 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-platform-error-digest',
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
