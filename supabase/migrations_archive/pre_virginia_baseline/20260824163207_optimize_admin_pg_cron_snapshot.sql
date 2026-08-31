create or replace function public.admin_get_pg_cron_snapshot()
returns table(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  command_kind text,
  last_status text,
  last_start_time timestamptz,
  last_end_time timestamptz,
  last_return_message text
)
language sql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  with latest_run as (
    select d.jobid, max(d.runid) as runid
    from cron.job_run_details d
    group by d.jobid
  )
  select
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active,
    case when j.command ilike '%functions/v1/%' or j.command ilike '%net.http%' then 'http' else 'sql' end::text,
    d.status::text,
    d.start_time,
    d.end_time,
    d.return_message::text
  from cron.job j
  left join latest_run r on r.jobid = j.jobid
  left join cron.job_run_details d on d.runid = r.runid
  order by j.jobname;
$function$;

revoke execute on function public.admin_get_pg_cron_snapshot() from public, anon, authenticated;
grant execute on function public.admin_get_pg_cron_snapshot() to service_role;
