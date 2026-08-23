do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'career-automation-worker' limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'career-automation-worker',
  '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/career-automation-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_internal_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $job$
);
