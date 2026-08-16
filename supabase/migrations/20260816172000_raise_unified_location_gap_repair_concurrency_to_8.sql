do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'unified-location-gap-repair'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'unified-location-gap-repair',
    '* * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_project_url') || '/functions/v1/unified-location-gap-repair',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reservation_cron_secret')
      ),
      body := '{"source":"cron","limit":30,"concurrency":8}'::jsonb,
      timeout_milliseconds := 50000
    );
    $job$
  );
end $$;
