-- TheOutHaven Platform Error Digest — 6:15 AM America/New_York.
-- Fire at both possible UTC equivalents; the Edge Function New York-time guard prevents duplicate sends.
-- Replace placeholders when applying manually. Production automation should reuse the existing secure cron headers without exposing secret values.

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
      'x-cron-secret', 'YOUR_CRON_SECRET',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := jsonb_build_object('source', 'cron', 'force', false)
  );
  $$
);
