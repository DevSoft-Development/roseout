-- TheOutHaven Edge Function cron setup.
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running.
-- Supabase scheduled Edge Functions commonly use pg_cron + pg_net.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Nightly photo backfill: 2:30 AM New York during EDT = 6:30 AM UTC.
select cron.schedule(
  'nightly-photo-backfill',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-photo-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('source', 'cron', 'batchSize', 50)
  );
  $$
);

-- Beta tester reminders: weekdays at 10 AM New York during EDT = 2 PM UTC.
select cron.schedule(
  'beta-tester-reminders',
  '0 14 * * 1-5',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/beta-tester-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Admin digest email: daily at 8 AM New York during EDT = noon UTC.
select cron.schedule(
  'admin-cron-digest-email',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-cron-digest-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('hours', 24, 'sendEmail', true)
  );
  $$
);
