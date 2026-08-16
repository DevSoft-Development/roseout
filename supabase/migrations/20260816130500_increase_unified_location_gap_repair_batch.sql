do $$
begin
  perform cron.unschedule('unified-location-gap-repair')
  where exists (select 1 from cron.job where jobname = 'unified-location-gap-repair');

  perform cron.schedule(
    'unified-location-gap-repair',
    '* * * * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/unified-location-gap-repair',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron","limit":30}'::jsonb,
      timeout_milliseconds := 50000
    );$job$
  );
end $$;
