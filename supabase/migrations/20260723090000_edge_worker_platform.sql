-- Durable background-job and notification platform for Supabase Edge Functions.
create extension if not exists pgcrypto;

create table if not exists public.worker_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','dead_letter')),
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  heartbeat_at timestamptz,
  progress_current bigint not null default 0,
  progress_total bigint,
  result jsonb,
  last_error text,
  idempotency_key text,
  parent_job_id uuid references public.worker_jobs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists worker_jobs_idempotency_key_idx
  on public.worker_jobs(idempotency_key) where idempotency_key is not null;
create index if not exists worker_jobs_claim_idx
  on public.worker_jobs(status, run_after, priority, created_at);
create index if not exists worker_jobs_type_idx
  on public.worker_jobs(job_type, status, created_at desc);

create table if not exists public.worker_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.worker_jobs(id) on delete cascade,
  level text not null default 'info' check (level in ('debug','info','warn','error')),
  event_type text not null,
  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists worker_job_events_job_idx on public.worker_job_events(job_id, created_at);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_type text not null,
  recipient_id text,
  recipient_email text,
  recipient_phone text,
  channels text[] not null default array['email']::text[],
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','delivered','partial','failed','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  idempotency_key text,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index if not exists notification_events_idempotency_idx
  on public.notification_events(idempotency_key) where idempotency_key is not null;
create index if not exists notification_events_claim_idx
  on public.notification_events(status, run_after, created_at);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  channel text not null,
  provider text,
  provider_message_id text,
  status text not null,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.search_parity_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.worker_jobs(id) on delete set null,
  query text not null,
  legacy_result jsonb,
  candidate_result jsonb,
  parity_score numeric,
  passed boolean,
  differences jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.enqueue_worker_job(
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_priority integer default 100,
  p_run_after timestamptz default now(),
  p_idempotency_key text default null,
  p_max_attempts integer default 5,
  p_parent_job_id uuid default null
) returns public.worker_jobs
language plpgsql security definer set search_path = public as $$
declare v_job public.worker_jobs;
begin
  insert into public.worker_jobs(job_type,payload,priority,run_after,idempotency_key,max_attempts,parent_job_id,created_by)
  values (p_job_type,coalesce(p_payload,'{}'::jsonb),p_priority,p_run_after,p_idempotency_key,p_max_attempts,p_parent_job_id,auth.uid())
  on conflict (idempotency_key) where idempotency_key is not null
  do update set updated_at = now()
  returning * into v_job;
  return v_job;
end $$;

create or replace function public.claim_worker_jobs(
  p_worker_id text,
  p_job_types text[],
  p_limit integer default 5
) returns setof public.worker_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select id from public.worker_jobs
    where status = 'queued'
      and run_after <= now()
      and job_type = any(p_job_types)
    order by priority asc, created_at asc
    for update skip locked
    limit greatest(1, least(p_limit, 25))
  )
  update public.worker_jobs j
  set status='running', locked_at=now(), locked_by=p_worker_id, heartbeat_at=now(),
      attempts=j.attempts+1, started_at=coalesce(j.started_at,now()), updated_at=now()
  from candidates c where j.id=c.id
  returning j.*;
end $$;

create or replace function public.complete_worker_job(p_job_id uuid, p_result jsonb default '{}'::jsonb)
returns void language sql security definer set search_path=public as $$
  update public.worker_jobs set status='succeeded', result=coalesce(p_result,'{}'::jsonb),
    finished_at=now(), locked_at=null, locked_by=null, heartbeat_at=null, updated_at=now()
  where id=p_job_id;
$$;

create or replace function public.fail_worker_job(p_job_id uuid, p_error text, p_retry_delay_seconds integer default 60)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.worker_jobs
  set status = case when attempts >= max_attempts then 'dead_letter' else 'queued' end,
      run_after = case when attempts >= max_attempts then run_after else now() + make_interval(secs => greatest(1,p_retry_delay_seconds)) end,
      last_error = left(coalesce(p_error,'Unknown worker error'),8000),
      locked_at=null, locked_by=null, heartbeat_at=null,
      finished_at = case when attempts >= max_attempts then now() else null end,
      updated_at=now()
  where id=p_job_id;
end $$;

create or replace function public.requeue_stale_worker_jobs(p_stale_minutes integer default 15)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.worker_jobs set status='queued', locked_at=null, locked_by=null, heartbeat_at=null,
    run_after=now(), last_error=coalesce(last_error,'') || E'\nRecovered stale worker lease', updated_at=now()
  where status='running' and coalesce(heartbeat_at,locked_at,started_at) < now() - make_interval(mins => p_stale_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

alter table public.worker_jobs enable row level security;
alter table public.worker_job_events enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.search_parity_runs enable row level security;

revoke all on function public.claim_worker_jobs(text,text[],integer) from public, anon, authenticated;
revoke all on function public.complete_worker_job(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.fail_worker_job(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.requeue_stale_worker_jobs(integer) from public, anon, authenticated;
grant execute on function public.enqueue_worker_job(text,jsonb,integer,timestamptz,text,integer,uuid) to authenticated;
