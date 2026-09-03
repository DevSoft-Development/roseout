-- Canonicalize the three morning digest telemetry keys onto the AWS schedule names.
--
-- The EventBridge manifest owns the canonical `daily-*` names, while the legacy
-- Edge Functions historically logged under `admin-*`. Move historical run
-- telemetry to the canonical keys, carry the latest execution state forward,
-- and remove the obsolete duplicate control-plane rows.

begin;

update public.cron_job_runs
set job_key = case job_key
  when 'admin-daily-marketing-pulse' then 'daily-marketing-pulse'
  when 'admin-platform-error-digest' then 'daily-platform-error-digest'
  when 'admin-search-health-digest' then 'daily-search-health-digest'
  else job_key
end
where job_key in (
  'admin-daily-marketing-pulse',
  'admin-platform-error-digest',
  'admin-search-health-digest'
);

with aliases(alias_key, canonical_key, schedule_hint) as (
  values
    ('admin-daily-marketing-pulse', 'daily-marketing-pulse', 'AWS EventBridge: cron(30 11,12 * * ? *)'),
    ('admin-platform-error-digest', 'daily-platform-error-digest', 'AWS EventBridge: cron(15 10,11 * * ? *)'),
    ('admin-search-health-digest', 'daily-search-health-digest', 'AWS EventBridge: cron(30 10,11 * * ? *)')
), latest as (
  select
    a.canonical_key,
    a.schedule_hint,
    c.last_status,
    c.last_started_at,
    c.last_completed_at,
    c.last_failed_at,
    c.last_duration_ms,
    c.last_message,
    c.last_details,
    c.last_error,
    c.updated_at
  from aliases a
  join public.cron_jobs c on c.job_key = a.alias_key
)
update public.cron_jobs canonical
set
  source = 'aws_eventbridge',
  schedule_hint = latest.schedule_hint,
  last_status = latest.last_status,
  last_started_at = latest.last_started_at,
  last_completed_at = latest.last_completed_at,
  last_failed_at = latest.last_failed_at,
  last_duration_ms = latest.last_duration_ms,
  last_message = latest.last_message,
  last_details = latest.last_details,
  last_error = latest.last_error,
  updated_at = greatest(canonical.updated_at, latest.updated_at)
from latest
where canonical.job_key = latest.canonical_key;

delete from public.cron_jobs
where job_key in (
  'admin-daily-marketing-pulse',
  'admin-platform-error-digest',
  'admin-search-health-digest'
);

commit;
