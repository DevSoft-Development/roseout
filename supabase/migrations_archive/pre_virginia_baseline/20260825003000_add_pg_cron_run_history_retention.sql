-- pg_cron does not automatically prune cron.job_run_details.
-- Keep one week of low-level scheduler history; application-level cron outcomes
-- continue to be tracked separately in public.cron_job_runs.
do $cron_history_retention$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'cron-run-history-retention'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$cron_history_retention$;

select cron.schedule(
  'cron-run-history-retention',
  '12 4 * * *',
  $cron$
    delete from cron.job_run_details
    where start_time < now() - interval '7 days';
  $cron$
);
