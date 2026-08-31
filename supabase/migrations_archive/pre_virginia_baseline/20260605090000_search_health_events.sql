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
  reviewed_at timestamptz,

  event_type text,
  severity text not null default 'info'
    check (severity in ('info','warning','error','critical')),
  event_label text
);

alter table public.search_health_events add column if not exists event_type text;
alter table public.search_health_events add column if not exists severity text not null default 'info';
alter table public.search_health_events add column if not exists event_label text;
alter table public.search_health_events add column if not exists review_status text not null default 'new';
alter table public.search_health_events add column if not exists review_notes text;
alter table public.search_health_events add column if not exists reviewed_by uuid;
alter table public.search_health_events add column if not exists reviewed_at timestamptz;

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

create index if not exists idx_search_health_events_event_type
on public.search_health_events(event_type);

create index if not exists idx_search_health_events_severity
on public.search_health_events(severity);

create table if not exists public.search_health_digest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text,
  sent boolean not null default false,
  recipient_count integer default 0,
  total_events integer default 0,
  error_count integer default 0,
  warning_count integer default 0,
  no_pair_count integer default 0,
  no_result_count integer default 0,
  slow_count integer default 0,
  response jsonb default '{}'::jsonb
);

create index if not exists idx_search_health_digest_runs_created_at
on public.search_health_digest_runs(created_at desc);

alter table public.search_health_events enable row level security;
alter table public.search_health_digest_runs enable row level security;

-- Admin access is intentionally handled through protected server routes using
-- the service-role client. No public select/insert/update policies are created.
