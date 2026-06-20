create extension if not exists pgcrypto;

create table if not exists public.location_ml_features (
  location_id uuid primary key references public.locations(id) on delete cascade,
  updated_at timestamptz not null default now(),
  impressions_7d integer not null default 0,
  impressions_30d integer not null default 0,
  views_7d integer not null default 0,
  views_30d integer not null default 0,
  clicks_7d integer not null default 0,
  clicks_30d integer not null default 0,
  reservation_clicks_30d integer not null default 0,
  call_clicks_30d integer not null default 0,
  website_clicks_30d integer not null default 0,
  saves_30d integer not null default 0,
  completed_outings_30d integer not null default 0,
  negative_signals_30d integer not null default 0,
  ctr_30d numeric not null default 0,
  conversion_rate_30d numeric not null default 0,
  engagement_score numeric not null default 0,
  conversion_score numeric not null default 0,
  freshness_score numeric not null default 0,
  quality_component numeric not null default 0,
  ml_score numeric not null default 0,
  score_version text not null default 'ml_rank_v1',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.location_ml_score_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'completed',
  processed_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0,
  score_version text not null default 'ml_rank_v1',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists location_ml_features_updated_at_idx on public.location_ml_features (updated_at desc);
create index if not exists location_ml_features_ml_score_idx on public.location_ml_features (ml_score desc);
create index if not exists location_ml_features_engagement_score_idx on public.location_ml_features (engagement_score desc);
create index if not exists location_ml_score_runs_created_at_idx on public.location_ml_score_runs (created_at desc);

alter table public.location_ml_features enable row level security;
alter table public.location_ml_score_runs enable row level security;
