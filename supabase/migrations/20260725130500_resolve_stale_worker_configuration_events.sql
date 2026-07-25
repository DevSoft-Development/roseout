create or replace function public.resolve_worker_configuration_events_after_success()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'succeeded'
     and old.status is distinct from new.status then
    update public.worker_job_events
    set metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{code}',
        to_jsonb('HISTORICAL_UNSUPPORTED_WORKER_JOB_TYPE'::text),
        true
      ),
      '{resolved_at}',
      to_jsonb(now()),
      true
    ) || jsonb_build_object(
      'resolved_by_status', new.status,
      'resolved_job_id', new.id
    )
    where job_id = new.id
      and metadata ->> 'code' = 'UNSUPPORTED_WORKER_JOB_TYPE';
  end if;

  return new;
end;
$$;

drop trigger if exists worker_jobs_resolve_configuration_events on public.worker_jobs;

create trigger worker_jobs_resolve_configuration_events
after update of status on public.worker_jobs
for each row
execute function public.resolve_worker_configuration_events_after_success();

update public.worker_job_events as event
set metadata = jsonb_set(
  jsonb_set(
    coalesce(event.metadata, '{}'::jsonb),
    '{code}',
    to_jsonb('HISTORICAL_UNSUPPORTED_WORKER_JOB_TYPE'::text),
    true
  ),
  '{resolved_at}',
  to_jsonb(now()),
  true
) || jsonb_build_object(
  'resolved_by_status', job.status,
  'resolved_job_id', job.id
)
from public.worker_jobs as job
where event.job_id = job.id
  and job.status = 'succeeded'
  and event.metadata ->> 'code' = 'UNSUPPORTED_WORKER_JOB_TYPE';

revoke all on function public.resolve_worker_configuration_events_after_success() from public;
grant execute on function public.resolve_worker_configuration_events_after_success() to service_role;
