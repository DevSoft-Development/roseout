create extension if not exists pg_trgm;

create table if not exists public.search_health_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  source text not null default 'search',
  environment text default 'production',

  raw_query text,
  normalized_search_type text,
  primary_domain text,

  default_market_applied boolean,
  default_market_id text,
  distance_mode text,
  max_pair_distance_miles numeric,
  max_pair_walking_minutes numeric,

  restaurant_count integer,
  activity_count integer,
  pair_count integer,
  pair_candidates_evaluated integer,
  valid_pair_count_before_render integer,

  no_results_reason text,
  no_pairs_reason text,

  errors jsonb default '[]'::jsonb,
  warnings jsonb default '[]'::jsonb,
  debug jsonb default '{}'::jsonb,

  timing_ms integer,
  speed_status text,

  created_by_user_id uuid,
  beta_tester_id uuid,
  beta_assignment_id uuid,

  review_status text not null default 'new'
    check (review_status in ('new','reviewing','fixed','ignored','archived')),
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz
);

create index if not exists idx_search_health_events_created_at
on public.search_health_events(created_at desc);

create index if not exists idx_search_health_events_raw_query
on public.search_health_events using gin (raw_query gin_trgm_ops);

create index if not exists idx_search_health_events_no_pairs_reason
on public.search_health_events(no_pairs_reason);

create index if not exists idx_search_health_events_no_results_reason
on public.search_health_events(no_results_reason);

create index if not exists idx_search_health_events_speed_status
on public.search_health_events(speed_status);

create index if not exists idx_search_health_events_review_status
on public.search_health_events(review_status);

alter table public.search_health_events enable row level security;

-- Admin access is intentionally handled through protected server routes using
-- the service-role client. No public select/insert/update policies are created.
