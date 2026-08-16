select cron.unschedule(jobid)
from cron.job
where jobname = 'unified-location-gap-repair';

select cron.schedule(
  'unified-location-gap-repair',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/unified-location-gap-repair',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron","limit":50,"concurrency":8,"textSearchLimit":3}'::jsonb,
      timeout_milliseconds := 50000
    );
  $cron$
);
