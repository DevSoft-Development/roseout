begin;

create table if not exists public.location_enrichment_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'planned' check (status in ('planned','queued','running','paused','completed','cancelled','failed','budget_stopped')),
  mode text not null default 'repair' check (mode in ('repair','full_refresh')),
  source_table text not null default 'locations' check (source_table in ('locations')),
  stale_days integer not null default 90 check (stale_days between 1 and 3650),
  batch_size integer not null default 5 check (batch_size between 1 and 25),
  enable_food_probe boolean not null default true,
  max_food_probes_per_row integer not null default 2 check (max_food_probes_per_row between 0 and 3),
  max_api_calls integer,
  estimated_records integer not null default 0,
  estimated_api_calls integer not null default 0,
  processed_records integer not null default 0,
  matched_records integer not null default 0,
  review_records integer not null default 0,
  no_match_records integer not null default 0,
  failed_records integer not null default 0,
  actual_api_calls integer not null default 0,
  batches_completed integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  before_quality jsonb not null default '{}'::jsonb,
  after_quality jsonb not null default '{}'::jsonb,
  last_batch jsonb not null default '{}'::jsonb,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists location_enrichment_runs_status_created_idx
  on public.location_enrichment_runs(status, created_at desc);

create table if not exists public.location_enrichment_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.location_enrichment_runs(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists location_enrichment_run_events_run_idx
  on public.location_enrichment_run_events(run_id, created_at desc);

alter table public.location_enrichment_runs enable row level security;
alter table public.location_enrichment_run_events enable row level security;

-- Service-role/admin server code owns these tables. No direct client grants.
revoke all on public.location_enrichment_runs from anon, authenticated;
revoke all on public.location_enrichment_run_events from anon, authenticated;

commit;
