-- TheOutHaven Edge Function cron setup.
-- Safe to rerun: existing job names are unscheduled before scheduling replacements.
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET or use Vault/templating in deployment.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname in (
  'nightly-photo-backfill',
  'beta-tester-reminders',
  'admin-cron-digest-email',
  'nightly-demo-reset',
  'team-session-watchdog'
);

select cron.schedule('nightly-photo-backfill','30 6 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-photo-backfill',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron','batchSize',50)
  );
$$);

select cron.schedule('beta-tester-reminders','0 14 * * 1-5',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/beta-tester-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron')
  );
$$);

select cron.schedule('admin-cron-digest-email','0 12 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-cron-digest-email',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('hours',24,'sendEmail',true)
  );
$$);

select cron.schedule('nightly-demo-reset','15 8 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-demo-reset',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron')
  );
$$);

select cron.schedule('team-session-watchdog','*/30 * * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/team-session-watchdog',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron')
  );
$$);
