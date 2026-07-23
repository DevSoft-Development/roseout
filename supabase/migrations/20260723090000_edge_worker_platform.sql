-- Durable Supabase Edge worker platform for long-running jobs.
create extension if not exists pgcrypto;

create table if not exists public.worker_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','dead_letter')),
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  idempotency_key text,
  progress_current integer not null default 0,
  progress_total integer,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  parent_job_id uuid references public.worker_jobs(id) on delete set null,
  created_by uuid,
  created_by_label text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  cancellation_requested_at timestamptz,
  checkpoint jsonb not null default '{}'::jsonb
);

create unique index if not exists worker_jobs_idempotency_key_idx on public.worker_jobs(idempotency_key) where idempotency_key is not null;
create index if not exists worker_jobs_claim_idx on public.worker_jobs(status, run_after, priority, created_at) where status = 'queued';
create index if not exists worker_jobs_type_status_idx on public.worker_jobs(job_type, status, run_after desc);
create index if not exists worker_jobs_parent_idx on public.worker_jobs(parent_job_id);
create index if not exists worker_jobs_recent_failures_idx on public.worker_jobs(updated_at desc) where status in ('failed','dead_letter');

create table if not exists public.worker_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.worker_jobs(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text
);
create index if not exists worker_job_events_job_created_idx on public.worker_job_events(job_id, created_at desc);

create table if not exists public.worker_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_key text not null unique,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  cron_expression text not null,
  enabled boolean not null default false,
  idempotency_window text not null default 'day',
  last_enqueued_job_id uuid references public.worker_jobs(id) on delete set null,
  last_enqueued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_job_checkpoints (
  job_id uuid primary key references public.worker_jobs(id) on delete cascade,
  checkpoint jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  channels text[] not null default array['email']::text[],
  status text not null default 'queued' check (status in ('queued','processing','delivered','partial_failed','failed','dead_letter','cancelled')),
  idempotency_key text,
  run_after timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);
create unique index if not exists notification_events_idempotency_key_idx on public.notification_events(idempotency_key) where idempotency_key is not null;
create index if not exists notification_events_claim_idx on public.notification_events(status, run_after, created_at) where status in ('queued','partial_failed','failed');

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  channel text not null check (channel in ('email','sms','dashboard','webhook')),
  recipient_hash text,
  template_key text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead_letter','cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  provider_message_id text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(event_id, channel, recipient_hash, template_key)
);
create index if not exists notification_deliveries_claim_idx on public.notification_deliveries(status, run_after, created_at);

create table if not exists public.search_parity_runs (
  id uuid primary key default gen_random_uuid(), query text not null, legacy_summary jsonb not null default '{}'::jsonb, candidate_summary jsonb not null default '{}'::jsonb, metrics jsonb not null default '{}'::jsonb, status text not null default 'queued', job_id uuid references public.worker_jobs(id) on delete set null, created_at timestamptz not null default now(), completed_at timestamptz
);

create table if not exists public.search_qa_runs (
  id uuid primary key default gen_random_uuid(), status text not null default 'queued', query_count integer not null default 0, processed_count integer not null default 0, failed_count integer not null default 0, payload jsonb not null default '{}'::jsonb, job_id uuid references public.worker_jobs(id) on delete set null, created_by uuid, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.search_qa_results (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.search_qa_runs(id) on delete cascade, query text not null, status text not null default 'queued', normalized_intent jsonb not null default '{}'::jsonb, result_summary jsonb not null default '{}'::jsonb, diagnostics jsonb not null default '{}'::jsonb, duration_ms integer, error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index if not exists search_qa_results_run_idx on public.search_qa_results(run_id, created_at);

create table if not exists public.import_job_results (
  id uuid primary key default gen_random_uuid(), job_id uuid references public.worker_jobs(id) on delete set null, source text not null, source_cursor text, counters jsonb not null default '{}'::jsonb, provider_state jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

alter table public.worker_jobs enable row level security;
alter table public.worker_job_events enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

drop function if exists public.enqueue_worker_job(text,jsonb,integer,text,integer,integer,timestamptz,uuid,text,uuid);
create or replace function public.enqueue_worker_job(p_job_type text,p_payload jsonb default '{}'::jsonb,p_payload_version integer default 1,p_idempotency_key text default null,p_priority integer default 100,p_max_attempts integer default 5,p_run_after timestamptz default now(),p_parent_job_id uuid default null,p_created_by_label text default null,p_created_by uuid default null)
returns public.worker_jobs language plpgsql security definer set search_path=public as $$
declare v_job public.worker_jobs;
begin
  insert into public.worker_jobs(job_type,payload,payload_version,idempotency_key,priority,max_attempts,run_after,parent_job_id,created_by_label,created_by)
  values(p_job_type,coalesce(p_payload,'{}'::jsonb),p_payload_version,p_idempotency_key,p_priority,p_max_attempts,coalesce(p_run_after,now()),p_parent_job_id,p_created_by_label,p_created_by)
  on conflict (idempotency_key) where idempotency_key is not null do update set updated_at=worker_jobs.updated_at
  returning * into v_job;
  insert into public.worker_job_events(job_id,event_type,message,metadata,created_by) values(v_job.id,'enqueued','Job enqueued',jsonb_build_object('job_type',v_job.job_type),'enqueue_worker_job');
  return v_job;
end $$;

create or replace function public.claim_worker_jobs(p_worker text,p_limit integer default 5,p_job_types text[] default null,p_lease_seconds integer default 120)
returns setof public.worker_jobs language plpgsql security definer set search_path=public as $$
begin
  return query with candidates as (
    select id from public.worker_jobs
    where status='queued' and run_after<=now() and (p_job_types is null or job_type=any(p_job_types))
    order by priority asc, run_after asc, created_at asc
    limit greatest(1, least(p_limit, 25)) for update skip locked
  )
  update public.worker_jobs j set status='running', attempt_count=attempt_count+1, started_at=coalesce(started_at,now()), updated_at=now(), lease_owner=p_worker, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), heartbeat_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;

create or replace function public.update_worker_job_progress(p_job_id uuid,p_progress_current integer,p_progress_total integer default null,p_checkpoint jsonb default null,p_result jsonb default null)
returns public.worker_jobs language plpgsql security definer set search_path=public as $$
declare v_job public.worker_jobs;
begin
 update public.worker_jobs set progress_current=greatest(0,p_progress_current), progress_total=coalesce(p_progress_total,progress_total), checkpoint=coalesce(p_checkpoint,checkpoint), result=coalesce(p_result,result), heartbeat_at=now(), updated_at=now() where id=p_job_id returning * into v_job;
 insert into public.worker_job_checkpoints(job_id, checkpoint) values(p_job_id, v_job.checkpoint) on conflict (job_id) do update set checkpoint=excluded.checkpoint, updated_at=now();
 return v_job;
end $$;

create or replace function public.heartbeat_worker_job(p_job_id uuid,p_worker text,p_lease_seconds integer default 120) returns void language sql security definer set search_path=public as $$ update public.worker_jobs set heartbeat_at=now(), lease_owner=p_worker, lease_expires_at=now()+make_interval(secs=>p_lease_seconds), updated_at=now() where id=p_job_id and status='running'; $$;
create or replace function public.complete_worker_job(p_job_id uuid,p_result jsonb default '{}'::jsonb) returns void language sql security definer set search_path=public as $$ update public.worker_jobs set status='succeeded', result=coalesce(p_result,'{}'::jsonb), completed_at=now(), updated_at=now(), lease_owner=null, lease_expires_at=null where id=p_job_id; insert into public.worker_job_events(job_id,event_type,message,metadata,created_by) values(p_job_id,'succeeded','Job completed',coalesce(p_result,'{}'::jsonb),'complete_worker_job'); $$;
create or replace function public.fail_worker_job(p_job_id uuid,p_error text,p_retryable boolean default true,p_backoff_seconds integer default 60,p_metadata jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=public as $$
declare v_attempts int; v_max int; v_status text;
begin select attempt_count,max_attempts into v_attempts,v_max from public.worker_jobs where id=p_job_id; v_status := case when p_retryable and v_attempts < v_max then 'queued' when p_retryable then 'dead_letter' else 'failed' end; update public.worker_jobs set status=v_status,last_error=p_error,run_after=case when v_status='queued' then now()+make_interval(secs=>greatest(1,p_backoff_seconds)) else run_after end,updated_at=now(),completed_at=case when v_status in ('failed','dead_letter') then now() else completed_at end,lease_owner=null,lease_expires_at=null where id=p_job_id; insert into public.worker_job_events(job_id,event_type,message,metadata,created_by) values(p_job_id,v_status,p_error,coalesce(p_metadata,'{}'::jsonb),'fail_worker_job'); end $$;
create or replace function public.cancel_worker_job(p_job_id uuid,p_reason text default null) returns void language sql security definer set search_path=public as $$ update public.worker_jobs set status='cancelled', cancellation_requested_at=now(), completed_at=now(), updated_at=now(), last_error=p_reason where id=p_job_id and status in ('queued','running','failed','dead_letter'); insert into public.worker_job_events(job_id,event_type,message,created_by) values(p_job_id,'cancelled',coalesce(p_reason,'Job cancelled'),'cancel_worker_job'); $$;
create or replace function public.retry_worker_job(p_job_id uuid,p_run_after timestamptz default now()) returns public.worker_jobs language plpgsql security definer set search_path=public as $$ declare v_job public.worker_jobs; begin update public.worker_jobs set status='queued', run_after=coalesce(p_run_after,now()), completed_at=null, lease_owner=null, lease_expires_at=null, updated_at=now() where id=p_job_id and status in ('failed','dead_letter','cancelled') returning * into v_job; insert into public.worker_job_events(job_id,event_type,message,created_by) values(p_job_id,'retried','Job returned to queue','retry_worker_job'); return v_job; end $$;
create or replace function public.recover_stale_worker_jobs(p_stale_seconds integer default 300) returns integer language plpgsql security definer set search_path=public as $$ declare v_count integer; begin update public.worker_jobs set status='queued', run_after=now(), lease_owner=null, lease_expires_at=null, updated_at=now(), last_error=coalesce(last_error,'stale lease recovered') where status='running' and coalesce(lease_expires_at, heartbeat_at + make_interval(secs=>p_stale_seconds)) < now(); get diagnostics v_count = row_count; return v_count; end $$;

revoke all on function public.enqueue_worker_job(text,jsonb,integer,text,integer,integer,timestamptz,uuid,text,uuid) from anon, authenticated;
revoke all on function public.claim_worker_jobs(text,integer,text[],integer) from anon, authenticated;
revoke all on function public.update_worker_job_progress(uuid,integer,integer,jsonb,jsonb) from anon, authenticated;
revoke all on function public.heartbeat_worker_job(uuid,text,integer) from anon, authenticated;
revoke all on function public.complete_worker_job(uuid,jsonb) from anon, authenticated;
revoke all on function public.fail_worker_job(uuid,text,boolean,integer,jsonb) from anon, authenticated;
revoke all on function public.cancel_worker_job(uuid,text) from anon, authenticated;
revoke all on function public.retry_worker_job(uuid,timestamptz) from anon, authenticated;
revoke all on function public.recover_stale_worker_jobs(integer) from anon, authenticated;
