-- Repair cron job registry compatibility for the admin cron jobs dashboard.
create extension if not exists pgcrypto;

create table if not exists public.cron_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  job_name text not null,
  route_path text,
  description text,
  schedule_hint text,
  source text,
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
  updated_at timestamptz not null default now()
);

alter table public.cron_jobs add column if not exists job_key text;
alter table public.cron_jobs add column if not exists job_name text;
alter table public.cron_jobs add column if not exists route_path text;
alter table public.cron_jobs add column if not exists description text;
alter table public.cron_jobs add column if not exists schedule_hint text;
alter table public.cron_jobs add column if not exists source text;
alter table public.cron_jobs add column if not exists is_active boolean not null default true;
alter table public.cron_jobs add column if not exists is_manually_runnable boolean not null default false;
alter table public.cron_jobs add column if not exists send_success_email boolean not null default false;
alter table public.cron_jobs add column if not exists send_failure_email boolean not null default true;
alter table public.cron_jobs add column if not exists email_recipients text[] not null default '{}';
alter table public.cron_jobs add column if not exists last_status text not null default 'never_run';
alter table public.cron_jobs add column if not exists last_started_at timestamptz;
alter table public.cron_jobs add column if not exists last_completed_at timestamptz;
alter table public.cron_jobs add column if not exists last_failed_at timestamptz;
alter table public.cron_jobs add column if not exists last_duration_ms integer;
alter table public.cron_jobs add column if not exists last_message text;
alter table public.cron_jobs add column if not exists last_details jsonb not null default '{}'::jsonb;
alter table public.cron_jobs add column if not exists last_error text;
alter table public.cron_jobs add column if not exists created_at timestamptz not null default now();
alter table public.cron_jobs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text,
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

alter table public.cron_job_runs add column if not exists job_key text;
alter table public.cron_job_runs add column if not exists completed_at timestamptz;
alter table public.cron_job_runs add column if not exists message text;
alter table public.cron_job_runs add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.cron_job_runs add column if not exists error_stack text;

update public.cron_job_runs
set job_key = lower(regexp_replace(coalesce(function_name, job_name, 'unknown-cron-job'), '[^a-zA-Z0-9]+', '-', 'g'))
where job_key is null;
update public.cron_job_runs set completed_at = finished_at where completed_at is null and finished_at is not null;
update public.cron_job_runs set details = metadata where (details is null or details = '{}'::jsonb) and metadata is not null and metadata <> '{}'::jsonb;
update public.cron_job_runs set message = coalesce(error_message, status) where message is null and (error_message is not null or status is not null);

update public.cron_job_runs
set status = case
  when lower(status) in ('running','started','success','failed','skipped','warning','error') then lower(status)
  when lower(status) in ('failure','failed_error') then 'failed'
  when lower(status) in ('partial','partial_success','degraded') then 'warning'
  else 'warning'
end;
update public.cron_jobs
set last_status = case when lower(last_status) in ('never_run','running','success','failed') then lower(last_status) when lower(last_status) in ('error','failure') then 'failed' else 'never_run' end;

alter table public.cron_jobs drop constraint if exists cron_jobs_last_status_check;
alter table public.cron_jobs add constraint cron_jobs_last_status_check check (last_status in ('never_run','running','success','failed'));
alter table public.cron_job_runs drop constraint if exists cron_job_runs_status_check;
alter table public.cron_job_runs add constraint cron_job_runs_status_check check (status in ('running','started','success','failed','skipped','warning','error'));

create unique index if not exists cron_jobs_job_key_key on public.cron_jobs(job_key);
create index if not exists cron_jobs_job_key_idx on public.cron_jobs(job_key);
create index if not exists cron_jobs_source_idx on public.cron_jobs(source);
create index if not exists cron_jobs_last_status_idx on public.cron_jobs(last_status);
create index if not exists cron_jobs_last_completed_at_idx on public.cron_jobs(last_completed_at desc);
create index if not exists cron_jobs_last_failed_at_idx on public.cron_jobs(last_failed_at desc);
create index if not exists cron_job_runs_job_key_created_at_idx on public.cron_job_runs(job_key, created_at desc);
create index if not exists cron_job_runs_status_created_at_idx on public.cron_job_runs(status, created_at desc);
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cron_job_runs' and column_name = 'function_name') then
    create index if not exists cron_job_runs_function_name_created_at_idx on public.cron_job_runs(function_name, created_at desc);
  end if;
end $$;

insert into public.cron_jobs (job_key, job_name, route_path, description, schedule_hint, source, last_status, last_started_at, last_completed_at, last_failed_at, last_duration_ms, last_message, last_details, last_error, updated_at)
select distinct on (r.job_key)
  r.job_key,
  coalesce(nullif(r.job_name, ''), nullif(r.function_name, ''), r.job_key),
  case when r.function_name is not null then 'supabase/functions/' || r.function_name else null end,
  null,
  null,
  coalesce(nullif(r.source, ''), 'cron'),
  case when lower(r.status) in ('failed','error') or r.error_message is not null then 'failed' when lower(r.status) in ('running','started') then 'running' else 'success' end,
  r.started_at,
  case when lower(r.status) in ('success','warning','skipped') then coalesce(r.completed_at, r.finished_at) else null end,
  case when lower(r.status) in ('failed','error') or r.error_message is not null then coalesce(r.completed_at, r.finished_at) else null end,
  r.duration_ms,
  coalesce(r.message, r.error_message, r.status),
  coalesce(r.details, r.metadata, '{}'::jsonb),
  r.error_message,
  now()
from public.cron_job_runs r
where r.job_key is not null
order by r.job_key, coalesce(r.created_at, r.started_at, r.finished_at, now()) desc
on conflict (job_key) do update set
  job_name = excluded.job_name,
  route_path = coalesce(nullif(public.cron_jobs.route_path, ''), excluded.route_path),
  description = coalesce(nullif(public.cron_jobs.description, ''), excluded.description),
  schedule_hint = coalesce(nullif(public.cron_jobs.schedule_hint, ''), excluded.schedule_hint),
  source = coalesce(nullif(public.cron_jobs.source, ''), excluded.source),
  last_status = excluded.last_status,
  last_started_at = excluded.last_started_at,
  last_completed_at = coalesce(excluded.last_completed_at, public.cron_jobs.last_completed_at),
  last_failed_at = coalesce(excluded.last_failed_at, public.cron_jobs.last_failed_at),
  last_duration_ms = excluded.last_duration_ms,
  last_message = excluded.last_message,
  last_details = excluded.last_details,
  last_error = excluded.last_error,
  updated_at = now()
where public.cron_jobs.last_status = 'never_run'
   or public.cron_jobs.last_started_at is null
   or coalesce(excluded.updated_at, now()) > public.cron_jobs.updated_at;

insert into public.cron_jobs (job_key, job_name, route_path, description, schedule_hint, source)
values
('beta-tester-reminders','Beta tester reminders','supabase/functions/beta-tester-reminders','Sends beta testing reminder emails.','pg_cron: 0 14 * * 1-5','edge_function'),
('admin-giveaway-review-reminder','Admin giveaway review reminder','supabase/functions/admin-giveaway-review-reminder','Emails admins about giveaway entries needing review.','pg_cron schedule in 20260608130000_admin_giveaway_review_reminder_cron.sql','edge_function'),
('reservation-daily-digest','Reservation daily digest','supabase/functions/reservation-daily-digest','Placeholder Edge Function; no production scheduler found in repo.','No repo schedule found','edge_function'),
('admin-search-health-digest','Admin search health digest','supabase/functions/admin-search-health-digest','Emails admins a search health digest.','pg_cron: 30 12 * * *','edge_function'),
('outing-reminders','Outing reminders','supabase/functions/outing-reminders','Processes scheduled outing reminders.','No repo schedule found','edge_function'),
('reservation-status-cleanup','Reservation status cleanup','supabase/functions/reservation-status-cleanup','Placeholder Edge Function; no production scheduler found in repo.','No repo schedule found','edge_function'),
('nightly-photo-backfill','Nightly photo backfill','supabase/functions/nightly-photo-backfill','Backfills location photos overnight.','pg_cron: 30 6 * * *','edge_function'),
('nightly-demo-reset','Nightly demo reset','supabase/functions/nightly-demo-reset','Resets demo data overnight.','pg_cron: 15 8 * * *','edge_function'),
('admin-cron-digest-email','Admin cron digest email','supabase/functions/admin-cron-digest-email','Emails admins a cron and import monitoring digest.','pg_cron: 0 12 * * *','edge_function'),
('reservation-reminder-cron','Reservation reminder cron','supabase/functions/reservation-reminder-cron','Placeholder Edge Function; no production scheduler found in repo.','No repo schedule found','edge_function'),
('team-session-watchdog','Team session watchdog','supabase/functions/team-session-watchdog','Expires stale team sessions.','pg_cron: */30 * * * *','edge_function'),
('google-location-enrichment','Google location enrichment','supabase/functions/google-location-enrichment','Enriches locations from Google data in the background.','No repo schedule found','edge_function')
on conflict (job_key) do update set
  job_name = excluded.job_name,
  route_path = coalesce(nullif(public.cron_jobs.route_path, ''), excluded.route_path),
  description = coalesce(nullif(public.cron_jobs.description, ''), excluded.description),
  schedule_hint = coalesce(nullif(public.cron_jobs.schedule_hint, ''), excluded.schedule_hint),
  source = coalesce(nullif(public.cron_jobs.source, ''), excluded.source),
  updated_at = now();

alter table public.cron_jobs enable row level security;
alter table public.cron_job_runs enable row level security;
drop policy if exists "Service role manages cron_jobs" on public.cron_jobs;
create policy "Service role manages cron_jobs" on public.cron_jobs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Admins read cron_jobs" on public.cron_jobs;
create policy "Admins read cron_jobs" on public.cron_jobs for select using (public.is_admin_user(auth.uid()));
drop policy if exists "Service role manages cron_job_runs" on public.cron_job_runs;
create policy "Service role manages cron_job_runs" on public.cron_job_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Admins read cron_job_runs" on public.cron_job_runs;
create policy "Admins read cron_job_runs" on public.cron_job_runs for select using (public.is_admin_user(auth.uid()));
