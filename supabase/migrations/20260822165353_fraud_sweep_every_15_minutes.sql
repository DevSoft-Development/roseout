select cron.unschedule('fraud-sweep-hourly');

select cron.schedule(
  'fraud-sweep-15m',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/fraud-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_internal_secret' limit 1)
    ),
    body := jsonb_build_object('source','supabase_cron','scheduled_at',now()),
    timeout_milliseconds := 30000
  );
  $$
);
