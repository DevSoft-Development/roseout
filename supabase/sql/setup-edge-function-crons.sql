-- TheOutHaven Edge Function cron setup. Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET.
-- Prefer storing secrets in Supabase Vault where available instead of inline literals.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'nightly-photo-backfill',
  '30 6 * * *', -- 2:30 AM America/New_York during EDT
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-photo-backfill',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := jsonb_build_object('source', 'cron', 'batchSize', 50)
  );
  $$
);

select cron.schedule(
  'beta-tester-reminders',
  '0 14 * * 1-5', -- 10:00 AM America/New_York during EDT, Monday-Friday
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/beta-tester-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

select cron.schedule(
  'admin-cron-digest-email',
  '0 12 * * *', -- 8:00 AM America/New_York during EDT
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-cron-digest-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := jsonb_build_object('hours', 24, 'sendEmail', true)
  );
  $$
);
