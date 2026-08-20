-- Keep durable workers recoverable when an Edge Function invocation is terminated
-- before it can explicitly requeue or fail the job. Expired running leases are
-- eligible to be claimed again from the last saved checkpoint.

create or replace function public.claim_worker_jobs(
  p_worker text,
  p_limit integer default 5,
  p_job_types text[] default null::text[],
  p_lease_seconds integer default 120
)
returns setof public.worker_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with candidates as (
    select id
    from public.worker_jobs
    where (
      (status = 'queued' and run_after <= now())
      or
      (status = 'running' and lease_expires_at is not null and lease_expires_at <= now())
    )
      and (p_job_types is null or job_type = any(p_job_types))
    order by priority asc, run_after asc, created_at asc
    limit greatest(1, least(p_limit, 25))
    for update skip locked
  )
  update public.worker_jobs j
  set
    status = 'running',
    attempt_count = attempt_count + 1,
    started_at = coalesce(started_at, now()),
    updated_at = now(),
    lease_owner = p_worker,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    heartbeat_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end
$function$;
