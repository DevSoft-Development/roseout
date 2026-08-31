-- Backfill registry state from authoritative run history so the soak gate
-- does not report false drift for healthy direct cron jobs.
with latest_run as (
  select distinct on (runs.job_key)
    runs.job_key,
    runs.status,
    runs.started_at,
    coalesce(runs.completed_at, runs.finished_at) as completed_at,
    runs.duration_ms,
    runs.message,
    runs.error_message
  from public.cron_job_runs runs
  join public.cron_jobs jobs on jobs.job_key = runs.job_key
  where jobs.is_active is true
    and jobs.last_status = 'never_run'
  order by
    runs.job_key,
    coalesce(runs.completed_at, runs.finished_at, runs.started_at, runs.created_at) desc
)
update public.cron_jobs jobs
set last_status = latest_run.status,
    last_started_at = latest_run.started_at,
    last_completed_at = case
      when latest_run.status = 'success' then latest_run.completed_at
      else jobs.last_completed_at
    end,
    last_failed_at = case
      when latest_run.status in ('failed', 'error') then latest_run.completed_at
      else jobs.last_failed_at
    end,
    last_duration_ms = latest_run.duration_ms,
    last_message = coalesce(
      latest_run.message,
      case
        when latest_run.status = 'success' then latest_run.job_key || ' completed successfully.'
        else latest_run.job_key || ' latest run status: ' || latest_run.status
      end
    ),
    last_error = latest_run.error_message,
    updated_at = clock_timestamp()
from latest_run
where jobs.job_key = latest_run.job_key;
