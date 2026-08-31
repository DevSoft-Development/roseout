-- The pre-launch giveaway has been retired. Stop its daily admin review reminder
-- without deleting historical giveaway data or the Edge Function implementation.
do $giveaway_retire$
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
$giveaway_retire$;

update public.cron_jobs
set
  is_active = false,
  is_manually_runnable = false,
  include_in_daily_digest = false,
  schedule_hint = 'Retired 2026-08-25; giveaway canceled',
  updated_at = now()
where job_key = 'admin-giveaway-review-reminder';
