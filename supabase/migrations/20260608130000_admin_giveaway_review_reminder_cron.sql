create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daily admin digest for giveaway entries that still need review.
-- Required database settings/secrets before this cron runs in production:
--   alter database postgres set app.supabase_url = 'https://<project-ref>.supabase.co';
--   alter database postgres set app.cron_secret = '<CRON_SECRET>';
-- Optional, but keeps cron health checks from warning about missing Authorization:
--   alter database postgres set app.supabase_service_role_key = '<SUPABASE_SERVICE_ROLE_KEY>';
-- The function itself still requires x-cron-secret to match CRON_SECRET.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'admin-giveaway-review-reminder'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'admin-giveaway-review-reminder',
  '0 13 * * *',
  $cron$
  select net.http_post(
    url := concat(rtrim(current_setting('app.supabase_url', true), '/'), '/functions/v1/admin-giveaway-review-reminder'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true),
      'Authorization', concat('Bearer ', current_setting('app.supabase_service_role_key', true))
    ),
    body := '{"source":"cron","dryRun":false}'::jsonb
  );
  $cron$
);
