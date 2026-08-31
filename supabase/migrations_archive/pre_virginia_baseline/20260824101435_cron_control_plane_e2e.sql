alter table public.cron_job_runs add column if not exists alert_dispatched_at timestamptz;
create index if not exists cron_job_runs_alert_dispatch_idx on public.cron_job_runs(alert_dispatched_at, created_at desc);

create or replace function public.admin_get_pg_cron_snapshot()
returns table (
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
set search_path = pg_catalog, public
as $$
  select
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active,
    case when j.command ilike '%functions/v1/%' or j.command ilike '%net.http%' then 'http' else 'sql' end::text,
    r.status::text,
    r.start_time,
    r.end_time,
    r.return_message::text
  from cron.job j
  left join lateral (
    select d.status, d.start_time, d.end_time, d.return_message, d.runid
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.start_time desc nulls last, d.runid desc
    limit 1
  ) r on true
  order by j.jobname;
$$;

revoke all on function public.admin_get_pg_cron_snapshot() from public;
revoke all on function public.admin_get_pg_cron_snapshot() from anon;
revoke all on function public.admin_get_pg_cron_snapshot() from authenticated;
grant execute on function public.admin_get_pg_cron_snapshot() to service_role;

create or replace function public.admin_set_pg_cron_active(p_job_name text, p_active boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_id bigint;
begin
  select j.jobid into v_job_id from cron.job j where j.jobname = p_job_name limit 1;
  if v_job_id is null then return false; end if;
  perform cron.alter_job(v_job_id, active => p_active);
  return true;
end;
$$;

revoke all on function public.admin_set_pg_cron_active(text, boolean) from public;
revoke all on function public.admin_set_pg_cron_active(text, boolean) from anon;
revoke all on function public.admin_set_pg_cron_active(text, boolean) from authenticated;
grant execute on function public.admin_set_pg_cron_active(text, boolean) to service_role;
