-- Repair the giveaway reminder schedule for hosted projects where app.* database
-- settings are not configured. Reuse the existing internal worker secret from
-- Vault and keep the function on custom server-to-server authentication.
do $giveaway_cleanup$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'admin-giveaway-review-reminder'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$giveaway_cleanup$;

select cron.schedule(
  'admin-giveaway-review-reminder',
  '0 13 * * *',
  $cron$
    select private.dispatch_tracked_edge_request(
      p_job_key := 'admin-giveaway-review-reminder',
      p_function_name := 'admin-giveaway-review-reminder',
      p_url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/admin-giveaway-review-reminder',
      p_headers := jsonb_build_object(
        'x-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'worker_internal_secret'
          limit 1
        )
      ),
      p_body := '{"source":"cron","dryRun":false}'::jsonb,
      p_timeout_milliseconds := 55000
    );
  $cron$
);
