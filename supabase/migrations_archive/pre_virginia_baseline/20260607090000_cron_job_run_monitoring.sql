create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  function_name text,
  source text default 'cron',
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  checked_count integer,
  success_count integer,
  skipped_count integer,
  failed_count integer,
  success_rate numeric,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.cron_job_runs add column if not exists function_name text;
alter table public.cron_job_runs add column if not exists source text default 'cron';
alter table public.cron_job_runs add column if not exists started_at timestamptz;
alter table public.cron_job_runs add column if not exists finished_at timestamptz;
alter table public.cron_job_runs add column if not exists duration_ms integer;
alter table public.cron_job_runs add column if not exists checked_count integer;
alter table public.cron_job_runs add column if not exists success_count integer;
alter table public.cron_job_runs add column if not exists skipped_count integer;
alter table public.cron_job_runs add column if not exists failed_count integer;
alter table public.cron_job_runs add column if not exists success_rate numeric;
alter table public.cron_job_runs add column if not exists error_message text;
alter table public.cron_job_runs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.cron_job_runs add column if not exists created_at timestamptz default now();

update public.cron_job_runs
set status = case
  when lower(status) in ('partial', 'partial_success', 'degraded') then 'warning'
  when lower(status) in ('error', 'failure') then 'failed'
  when lower(status) in ('success', 'failed', 'skipped', 'warning', 'started') then lower(status)
  else 'warning'
end
where status is distinct from case
  when lower(status) in ('partial', 'partial_success', 'degraded') then 'warning'
  when lower(status) in ('error', 'failure') then 'failed'
  when lower(status) in ('success', 'failed', 'skipped', 'warning', 'started') then lower(status)
  else 'warning'
end;

update public.cron_job_runs set function_name = coalesce(function_name, job_name) where function_name is null;
update public.cron_job_runs set source = coalesce(source, 'cron') where source is null;
update public.cron_job_runs set metadata = coalesce(metadata, '{}'::jsonb) where metadata is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cron_job_runs_status_check'
      and conrelid = 'public.cron_job_runs'::regclass
  ) then
    alter table public.cron_job_runs
      add constraint cron_job_runs_status_check
      check (status in ('success', 'failed', 'skipped', 'warning', 'started'));
  end if;
end $$;

create index if not exists idx_cron_job_runs_job_created on public.cron_job_runs(job_name, created_at desc);
create index if not exists idx_cron_job_runs_status_created on public.cron_job_runs(status, created_at desc);
create index if not exists idx_cron_job_runs_function_created on public.cron_job_runs(function_name, created_at desc);

alter table public.cron_job_runs enable row level security;

drop policy if exists "Service role manages cron_job_runs" on public.cron_job_runs;
create policy "Service role manages cron_job_runs"
  on public.cron_job_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Admins read cron_job_runs" on public.cron_job_runs;
create policy "Admins read cron_job_runs"
  on public.cron_job_runs for select
  using (public.is_admin_user(auth.uid()));

create or replace function public.get_theouthaven_cron_job_health()
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  function_name text,
  has_authorization_header boolean,
  has_cron_secret_header boolean,
  has_placeholder_values boolean,
  has_supabase_function_url boolean,
  warning_notes text[]
)
language sql
security definer
set search_path = public, cron
as $$
  select
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active::boolean,
    (regexp_match(j.command, '/functions/v1/([a-zA-Z0-9_-]+)'))[1]::text as function_name,
    (j.command ilike '%Authorization%') as has_authorization_header,
    (j.command ilike '%x-cron-secret%') as has_cron_secret_header,
    (
      j.command ilike '%YOUR_PROJECT_REF%'
      or j.command ilike '%YOUR_CRON_SECRET%'
      or j.command ilike '%PASTE_%'
    ) as has_placeholder_values,
    (j.command ilike '%functions/v1/%') as has_supabase_function_url,
    array_remove(array[
      case when not j.active then 'inactive' end,
      case when j.command not ilike '%Authorization%' then 'missing_authorization_header' end,
      case when j.command not ilike '%x-cron-secret%' then 'missing_x_cron_secret_header' end,
      case when j.command ilike '%YOUR_PROJECT_REF%' or j.command ilike '%YOUR_CRON_SECRET%' or j.command ilike '%PASTE_%' then 'placeholder_values_detected' end,
      case when j.command not ilike '%functions/v1/%' then 'not_an_edge_function_call' end
    ], null)::text[] as warning_notes
  from cron.job j
  where j.jobname ilike '%theouthaven%'
     or j.jobname in (
       'nightly-photo-backfill',
       'beta-tester-reminders',
       'admin-search-health-digest',
       'admin-cron-digest-email',
       'nightly-demo-reset',
       'team-session-watchdog'
     )
     or j.command ilike '%functions/v1/%'
     or j.command ilike '%theouthaven%'
  order by j.jobname;
$$;

revoke all on function public.get_theouthaven_cron_job_health() from public;
grant execute on function public.get_theouthaven_cron_job_health() to service_role;
grant execute on function public.get_theouthaven_cron_job_health() to authenticated;
