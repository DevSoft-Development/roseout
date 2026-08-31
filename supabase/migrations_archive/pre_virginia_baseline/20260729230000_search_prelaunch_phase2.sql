create table if not exists public.search_quality_replay_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('golden','production_replay','manual')),
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  query_count integer not null default 0,
  passed_count integer not null default 0,
  failed_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.search_quality_replay_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_quality_replay_runs(id) on delete cascade,
  source_search_id bigint,
  query text not null,
  category text not null,
  expectations jsonb not null default '{}'::jsonb,
  legacy_result jsonb,
  canonical_result jsonb,
  comparison jsonb not null default '{}'::jsonb,
  passed boolean,
  created_at timestamptz not null default now()
);

create index if not exists search_quality_replay_items_run_idx on public.search_quality_replay_items(run_id);
create index if not exists search_quality_replay_runs_created_idx on public.search_quality_replay_runs(created_at desc);

alter table public.search_quality_replay_runs enable row level security;
alter table public.search_quality_replay_items enable row level security;

revoke all on public.search_quality_replay_runs from anon, authenticated;
revoke all on public.search_quality_replay_items from anon, authenticated;
grant all on public.search_quality_replay_runs to service_role;
grant all on public.search_quality_replay_items to service_role;
