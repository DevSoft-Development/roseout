-- TheOutHaven Edge Function cron setup.
-- Replace YOUR_PROJECT_REF and YOUR_CRON_SECRET before running.
-- Prefer storing secrets in Supabase Vault where available instead of inline literals.
-- Supabase scheduled Edge Functions commonly use pg_cron + pg_net.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Nightly photo backfill: 2:30 AM America/New_York during EDT = 6:30 AM UTC.
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

-- Beta tester reminders: weekdays at 10:00 AM America/New_York during EDT = 2:00 PM UTC.
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

-- Admin digest email: daily at 8:00 AM America/New_York during EDT = noon UTC.
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

-- Nightly demo reset: daily at 4:15 AM America/New_York during EDT = 8:15 AM UTC.
select cron.schedule(
  'nightly-demo-reset',
  '15 8 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/nightly-demo-reset',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

-- Team session watchdog: every 30 minutes to catch sessions left open for more than 12 hours.
select cron.schedule(
  'team-session-watchdog',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/team-session-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
