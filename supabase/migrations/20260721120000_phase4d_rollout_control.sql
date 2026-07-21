create table if not exists public.search_ranking_rollout_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  rollout_percent integer not null default 0 check (rollout_percent between 0 and 100),
  admin_only boolean not null default true,
  eligible_markets text[] not null default array['nyc'],
  assignment_salt text not null default 'phase4d:v1',
  model_version text not null default 'hybrid:v1',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.search_ranking_rollout_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.search_ranking_experiments (
  id uuid primary key default gen_random_uuid(),
  search_id uuid,
  assignment_key_hash text not null,
  variant text not null check (variant in ('control','hybrid')),
  rollout_percent integer not null,
  market text,
  admin_eligible boolean not null default false,
  model_version text not null,
  restaurant_control_order text[] not null default '{}',
  restaurant_hybrid_order text[] not null default '{}',
  activity_control_order text[] not null default '{}',
  activity_hybrid_order text[] not null default '{}',
  latency_ms integer,
  no_results boolean not null default false,
  pair_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists search_ranking_experiments_created_at_idx on public.search_ranking_experiments(created_at desc);
create index if not exists search_ranking_experiments_variant_idx on public.search_ranking_experiments(variant, created_at desc);

alter table public.search_ranking_rollout_settings enable row level security;
alter table public.search_ranking_experiments enable row level security;
revoke all on public.search_ranking_rollout_settings from anon, authenticated;
revoke all on public.search_ranking_experiments from anon, authenticated;
grant all on public.search_ranking_rollout_settings to service_role;
grant all on public.search_ranking_experiments to service_role;

create or replace view public.search_ranking_rollout_analytics_v1 with (security_invoker = true) as
select
  variant,
  count(*)::bigint as searches,
  avg(latency_ms)::numeric(12,2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms,
  avg((no_results)::int)::numeric(8,4) as no_result_rate,
  avg(pair_count)::numeric(12,2) as avg_pair_count,
  min(created_at) as first_seen_at,
  max(created_at) as last_seen_at
from public.search_ranking_experiments
where created_at >= now() - interval '30 days'
group by variant;
revoke all on public.search_ranking_rollout_analytics_v1 from anon, authenticated;
grant select on public.search_ranking_rollout_analytics_v1 to service_role;