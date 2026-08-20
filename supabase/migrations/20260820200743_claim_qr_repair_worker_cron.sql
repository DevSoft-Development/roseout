-- Run the dedicated claim QR repair worker once per minute. The worker only
-- claims jobs with job_type = 'claim.qr_repair', so idle runs are inexpensive.
do $claim_qr_cleanup$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'claim-qr-repair-worker'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$claim_qr_cleanup$;

select cron.schedule(
  'claim-qr-repair-worker',
  '* * * * *',
  $cron$
    select private.dispatch_tracked_edge_request(
      p_job_key := 'claim-qr-repair-worker',
      p_function_name := 'claim-qr-repair-worker',
      p_url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/claim-qr-repair-worker',
      p_headers := jsonb_build_object(
        'x-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'worker_internal_secret'
          limit 1
        )
      ),
      p_body := '{}'::jsonb,
      p_timeout_milliseconds := 55000
    );
  $cron$
);
