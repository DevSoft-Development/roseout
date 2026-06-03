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
returns trigger
language plpgsql
as $$
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
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := false;
begin
  if user_id is null then
    return false;
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'select exists(select 1 from public.profiles where id = $1 and role in (''superadmin'',''admin'',''experience_team'',''sales_ambassador'',''support''))'
      into is_admin using user_id;
    if is_admin then return true; end if;
  end if;

  if to_regclass('public.admin_users') is not null then
    execute 'select exists(select 1 from public.admin_users where user_id = $1 and role in (''superadmin'',''admin'',''experience_team'',''sales_ambassador'',''support''))'
      into is_admin using user_id;
    if is_admin then return true; end if;
  end if;

  return false;
end;
$$;

alter table public.edge_function_logs enable row level security;
alter table public.cron_job_runs enable row level security;
alter table public.search_intent_cache enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'edge_function_logs' and policyname = 'Admins can read edge function logs') then
    create policy "Admins can read edge function logs" on public.edge_function_logs for select to authenticated using (public.is_admin_user(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cron_job_runs' and policyname = 'Admins can read cron job runs') then
    create policy "Admins can read cron job runs" on public.cron_job_runs for select to authenticated using (public.is_admin_user(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'search_intent_cache' and policyname = 'Admins can read search intent cache') then
    create policy "Admins can read search intent cache" on public.search_intent_cache for select to authenticated using (public.is_admin_user(auth.uid()));
  end if;
end $$;
