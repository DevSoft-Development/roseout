begin;

create table if not exists public.search_taxonomy_terms (
  canonical_term text primary key,
  domain text not null check (domain in ('restaurant','activity','feature','occasion','audience')),
  aliases text[] not null default '{}',
  eligible_roles text[] not null default '{}',
  incompatible_domains text[] not null default '{}',
  enabled boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.search_benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  class text not null,
  expected jsonb not null default '{}'::jsonb,
  known_inventory_required boolean not null default false,
  enabled boolean not null default true,
  weight numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production',
  commit_sha text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  totals jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb
);

create table if not exists public.search_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_benchmark_runs(id) on delete cascade,
  case_id uuid references public.search_benchmark_cases(id) on delete set null,
  query text not null,
  passed boolean not null,
  engine_correct boolean not null,
  fulfilled boolean not null,
  known_inventory_recalled boolean,
  failure_class text,
  no_result_reason text,
  latency_ms numeric,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists search_benchmark_results_run_idx on public.search_benchmark_results(run_id);
create index if not exists search_benchmark_results_failure_idx on public.search_benchmark_results(failure_class) where passed = false;

create table if not exists public.search_profile_coverage_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  geography_key text not null,
  domain text not null,
  canonical_term text,
  searchable_count integer not null default 0,
  classified_count integer not null default 0,
  valid_geo_count integer not null default 0,
  high_confidence_count integer not null default 0,
  pairable_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists search_profile_coverage_geo_idx
  on public.search_profile_coverage_snapshots(geography_key, domain, canonical_term, captured_at desc);

create or replace view public.search_failure_cluster_summary as
select
  coalesce(failure_class, 'UNCLASSIFIED') as failure_class,
  count(*) as failure_count,
  round(avg(latency_ms)::numeric, 2) as average_latency_ms,
  max(created_at) as last_seen_at
from public.search_benchmark_results
where passed = false
group by coalesce(failure_class, 'UNCLASSIFIED');

alter table public.search_taxonomy_terms enable row level security;
alter table public.search_benchmark_cases enable row level security;
alter table public.search_benchmark_runs enable row level security;
alter table public.search_benchmark_results enable row level security;
alter table public.search_profile_coverage_snapshots enable row level security;

revoke all on public.search_taxonomy_terms from anon, authenticated;
revoke all on public.search_benchmark_cases from anon, authenticated;
revoke all on public.search_benchmark_runs from anon, authenticated;
revoke all on public.search_benchmark_results from anon, authenticated;
revoke all on public.search_profile_coverage_snapshots from anon, authenticated;

grant select, insert, update, delete on public.search_taxonomy_terms to service_role;
grant select, insert, update, delete on public.search_benchmark_cases to service_role;
grant select, insert, update, delete on public.search_benchmark_runs to service_role;
grant select, insert, update, delete on public.search_benchmark_results to service_role;
grant select, insert, update, delete on public.search_profile_coverage_snapshots to service_role;

insert into public.search_taxonomy_terms (canonical_term, domain, aliases, eligible_roles)
values
  ('escape_room','activity',array['escape room','escape-room','escape_room','escape game','escape games','puzzle room','immersive game'],array['escape_room_activity']),
  ('live_music','activity',array['live music','live-music','live_music','music venue','concert venue','jazz club','live band'],array['live_music_activity']),
  ('karaoke','activity',array['karaoke','ktv','singing room','sing-along'],array['karaoke_activity']),
  ('sushi','restaurant',array['sushi','omakase','sashimi','japanese sushi'],array['restaurant','sushi_restaurant']),
  ('italian','restaurant',array['italian','trattoria','osteria','pasta','pizzeria'],array['restaurant','italian_restaurant']),
  ('halal','restaurant',array['halal','zabiha'],array['restaurant','halal_restaurant'])
on conflict (canonical_term) do update
set aliases = excluded.aliases,
    eligible_roles = excluded.eligible_roles,
    domain = excluded.domain,
    updated_at = now();

commit;
