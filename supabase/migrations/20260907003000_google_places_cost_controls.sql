create table if not exists public.google_places_usage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  job_key text not null default 'unknown',
  operation text not null,
  sku text not null,
  priority text not null default 'normal',
  paid boolean not null default false,
  blocked boolean not null default false,
  cache_hit boolean not null default false,
  reason text,
  query_key text,
  place_id text,
  estimated_unit_cost_usd numeric(12,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists google_places_usage_events_occurred_at_idx on public.google_places_usage_events (occurred_at desc);
create index if not exists google_places_usage_events_job_day_idx on public.google_places_usage_events (job_key, occurred_at desc);
create index if not exists google_places_usage_events_paid_idx on public.google_places_usage_events (paid, blocked, occurred_at desc);
alter table public.google_places_usage_events enable row level security;
revoke all on public.google_places_usage_events from anon, authenticated;
grant all on public.google_places_usage_events to service_role;

create table if not exists public.google_places_search_id_cache (
  cache_key text primary key,
  normalized_query text not null,
  place_ids text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_hit_at timestamptz,
  hit_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists google_places_search_id_cache_expires_idx on public.google_places_search_id_cache (expires_at);
alter table public.google_places_search_id_cache enable row level security;
revoke all on public.google_places_search_id_cache from anon, authenticated;
grant all on public.google_places_search_id_cache to service_role;

create table if not exists public.google_places_candidate_memory (
  memory_key text primary key,
  place_id text not null,
  job_key text not null,
  market text,
  area text,
  category text,
  outcome text not null,
  next_eligible_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists google_places_candidate_memory_place_idx on public.google_places_candidate_memory (place_id);
create index if not exists google_places_candidate_memory_next_idx on public.google_places_candidate_memory (next_eligible_at);
alter table public.google_places_candidate_memory enable row level security;
revoke all on public.google_places_candidate_memory from anon, authenticated;
grant all on public.google_places_candidate_memory to service_role;

create table if not exists public.google_places_job_budgets (
  job_key text primary key,
  daily_paid_call_limit integer not null check (daily_paid_call_limit >= 0),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.google_places_job_budgets enable row level security;
revoke all on public.google_places_job_budgets from anon, authenticated;
grant all on public.google_places_job_budgets to service_role;

insert into public.google_places_job_budgets (job_key, daily_paid_call_limit, priority, notes) values
  ('curated-location-discovery-restaurant', 8, 'low', 'Paid rich details only; ID-only search is free.'),
  ('curated-location-discovery-activity', 8, 'low', 'Paid rich details only; ID-only search is free.'),
  ('google-location-enrichment', 10, 'normal', 'Bounded metadata enrichment.'),
  ('nightly-photo-backfill', 5, 'low', 'Only fill publish-blocking photo gaps.'),
  ('public-google-place-photo', 20, 'high', 'User-facing fallback only; prefer owner/storage media.'),
  ('location-enrichment-reconcile', 4, 'low', 'Recovery path only.'),
  ('unknown', 5, 'normal', 'Fail-safe limit for uncategorized callers.')
on conflict (job_key) do update set
  daily_paid_call_limit = excluded.daily_paid_call_limit,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();

create table if not exists public.google_places_budget_alerts (
  id uuid primary key default gen_random_uuid(),
  billing_month text not null,
  threshold_pct integer not null check (threshold_pct in (50,75,90,100)),
  spend_usd numeric(12,2) not null,
  hard_cap_usd numeric(12,2) not null,
  credits_remaining_usd numeric(12,2) not null,
  operating_mode text not null,
  email_sent boolean not null default false,
  email_error text,
  created_at timestamptz not null default now(),
  unique (billing_month, threshold_pct)
);
alter table public.google_places_budget_alerts enable row level security;
revoke all on public.google_places_budget_alerts from anon, authenticated;
grant all on public.google_places_budget_alerts to service_role;
