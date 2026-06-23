create table if not exists public.cron_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  job_name text not null,
  route_path text,
  description text,
  schedule_hint text,
  is_active boolean not null default true,
  is_manually_runnable boolean not null default false,
  send_success_email boolean not null default false,
  send_failure_email boolean not null default true,
  email_recipients text[] not null default '{}',
  last_status text not null default 'never_run',
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_failed_at timestamptz,
  last_duration_ms integer,
  last_message text,
  last_details jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cron_jobs_last_status_check check (last_status in ('never_run','running','success','failed'))
);

create index if not exists cron_jobs_job_key_idx on public.cron_jobs(job_key);
create index if not exists cron_jobs_last_status_idx on public.cron_jobs(last_status);
create index if not exists cron_jobs_last_completed_at_idx on public.cron_jobs(last_completed_at desc);
create index if not exists cron_jobs_last_failed_at_idx on public.cron_jobs(last_failed_at desc);

create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  message text,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  error_stack text,
  created_at timestamptz not null default now(),
  constraint cron_job_runs_status_check check (status in ('running','success','failed')),
  constraint cron_job_runs_job_key_fkey foreign key (job_key) references public.cron_jobs(job_key) on update cascade on delete cascade
);

create index if not exists cron_job_runs_job_key_created_at_idx on public.cron_job_runs(job_key, created_at desc);
create index if not exists cron_job_runs_status_created_at_idx on public.cron_job_runs(status, created_at desc);

create or replace function public.set_cron_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cron_jobs_updated_at on public.cron_jobs;
create trigger set_cron_jobs_updated_at
before update on public.cron_jobs
for each row execute function public.set_cron_jobs_updated_at();

alter table public.cron_jobs enable row level security;
alter table public.cron_job_runs enable row level security;

create policy "cron_jobs_service_role_all" on public.cron_jobs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "cron_job_runs_service_role_all" on public.cron_job_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
