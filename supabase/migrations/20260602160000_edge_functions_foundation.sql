create extension if not exists pgcrypto;

create table if not exists public.edge_function_logs (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  status text not null default 'success',
  source text null,
  request_id text null,
  user_id uuid null,
  input_summary jsonb null,
  output_summary jsonb null,
  error_message text null,
  duration_ms integer null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);
create index if not exists edge_function_logs_function_name_idx on public.edge_function_logs(function_name);
create index if not exists edge_function_logs_status_idx on public.edge_function_logs(status);
create index if not exists edge_function_logs_created_at_idx on public.edge_function_logs(created_at desc);
create index if not exists edge_function_logs_user_id_idx on public.edge_function_logs(user_id);
create index if not exists edge_function_logs_source_idx on public.edge_function_logs(source);

create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null default 'success',
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  duration_ms integer null,
  checked_count integer not null default 0,
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  success_rate numeric null,
  error_message text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);
create index if not exists cron_job_runs_job_name_idx on public.cron_job_runs(job_name);
create index if not exists cron_job_runs_status_idx on public.cron_job_runs(status);
create index if not exists cron_job_runs_created_at_idx on public.cron_job_runs(created_at desc);

create table if not exists public.search_intent_cache (
  id uuid primary key default gen_random_uuid(),
  normalized_query text not null,
  query_hash text not null unique,
  intent_json jsonb not null,
  parser_source text not null default 'unknown',
  model text null,
  hit_count integer not null default 0,
  last_hit_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists search_intent_cache_query_hash_idx on public.search_intent_cache(query_hash);
create index if not exists search_intent_cache_normalized_query_idx on public.search_intent_cache(normalized_query);
create index if not exists search_intent_cache_parser_source_idx on public.search_intent_cache(parser_source);
create index if not exists search_intent_cache_expires_at_idx on public.search_intent_cache(expires_at);
create index if not exists search_intent_cache_created_at_idx on public.search_intent_cache(created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists search_intent_cache_set_updated_at on public.search_intent_cache;
create trigger search_intent_cache_set_updated_at
before update on public.search_intent_cache
for each row execute function public.set_updated_at();

create or replace function public.is_admin_user(user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  role_value text;
begin
  if user_id is null then return false; end if;
  if to_regclass('public.profiles') is not null then
    execute 'select role::text from public.profiles where user_id = $1 limit 1' into role_value using user_id;
    if role_value in ('superadmin','admin','experience_team','sales_ambassador','support') then return true; end if;
  end if;
  if to_regclass('public.admin_users') is not null then
    execute 'select role::text from public.admin_users where user_id = $1 limit 1' into role_value using user_id;
    if role_value in ('superadmin','admin','experience_team','sales_ambassador','support') then return true; end if;
  end if;
  return false;
exception when undefined_column then
  return false;
end;
$$;

create or replace function public.log_edge_function_run(
  function_name text,
  status text default 'success',
  source text default null,
  request_id text default null,
  user_id uuid default null,
  input_summary jsonb default null,
  output_summary jsonb default null,
  error_message text default null,
  duration_ms integer default null,
  metadata jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into public.edge_function_logs(function_name,status,source,request_id,user_id,input_summary,output_summary,error_message,duration_ms,metadata)
  values(function_name,status,source,request_id,user_id,input_summary,output_summary,error_message,duration_ms,metadata)
  returning id into new_id;
  return new_id;
end;
$$;

alter table public.edge_function_logs enable row level security;
alter table public.cron_job_runs enable row level security;
alter table public.search_intent_cache enable row level security;

drop policy if exists "Service role manages edge_function_logs" on public.edge_function_logs;
create policy "Service role manages edge_function_logs" on public.edge_function_logs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Admins read edge_function_logs" on public.edge_function_logs;
create policy "Admins read edge_function_logs" on public.edge_function_logs for select using (public.is_admin_user(auth.uid()));

drop policy if exists "Service role manages cron_job_runs" on public.cron_job_runs;
create policy "Service role manages cron_job_runs" on public.cron_job_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Admins read cron_job_runs" on public.cron_job_runs;
create policy "Admins read cron_job_runs" on public.cron_job_runs for select using (public.is_admin_user(auth.uid()));

drop policy if exists "Service role manages search_intent_cache" on public.search_intent_cache;
create policy "Service role manages search_intent_cache" on public.search_intent_cache for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists "Admins read search_intent_cache" on public.search_intent_cache;
create policy "Admins read search_intent_cache" on public.search_intent_cache for select using (public.is_admin_user(auth.uid()));

grant execute on function public.is_admin_user(uuid) to authenticated, service_role;
grant execute on function public.log_edge_function_run(text,text,text,text,uuid,jsonb,jsonb,text,integer,jsonb) to service_role;
