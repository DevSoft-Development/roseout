-- beta-tester-reminders is disabled; use /api/cron/beta-reminders.
select cron.unschedule('beta-tester-reminders') where exists (select 1 from cron.job where jobname = 'beta-tester-reminders');
-- TheOutHaven Edge Function cron setup.
-- Safe to rerun: existing job names are unscheduled before scheduling replacements.
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET or use Vault/templating in deployment.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname in (
  'nightly-photo-backfill',
  'beta-tester-reminders',
  'admin-search-health-digest',
  'admin-cron-digest-email',
  'nightly-demo-reset',
  'team-session-watchdog'
);

select cron.schedule('nightly-photo-backfill','30 6 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-photo-backfill',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_CRON_SECRET','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron','batchSize',50)
  );
$$);

-- Disabled/replaced by Next.js /api/cron/beta-reminders.

select cron.schedule('admin-search-health-digest','30 12 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-search-health-digest',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_CRON_SECRET','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron','hours',24)
  );
$$);

select cron.schedule('admin-cron-digest-email','0 12 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-cron-digest-email',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_CRON_SECRET','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('hours',24,'sendEmail',true)
  );
$$);

select cron.schedule('nightly-demo-reset','15 8 * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-demo-reset',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_CRON_SECRET','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron')
  );
$$);

select cron.schedule('team-session-watchdog','*/30 * * * *',$$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/team-session-watchdog',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_CRON_SECRET','x-cron-secret','YOUR_CRON_SECRET'),
    body := jsonb_build_object('source','cron')
  );
$$);

-- Note: Next.js cron routes now report to public.cron_jobs and public.cron_job_runs through lib/cron/runTrackedCron.ts.
-- Future Supabase Edge Functions that behave like cron jobs should also write to those tables so the admin cron jobs dashboard stays centralized.
