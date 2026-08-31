select cron.unschedule('worker-maintenance');

select cron.schedule(
  'worker-maintenance',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/worker-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'worker_internal_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'limit', 5,
        'lease_seconds', 180,
        'worker_name', 'production-maintenance-worker',
        'job_types', jsonb_build_array(
          'reservation.cleanup',
          'search.qa.batch',
          'search.anchor.reconcile'
        )
      ),
      timeout_milliseconds := 55000
    );
  $cron$
);