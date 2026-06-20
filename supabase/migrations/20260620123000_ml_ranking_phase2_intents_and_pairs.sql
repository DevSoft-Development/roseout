create table if not exists public.location_intent_ml_features (
  id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id) on delete cascade, intent_bucket text not null, market text null, location_type text null, market_key text not null default '', location_type_key text not null default '', updated_at timestamptz not null default now(),
  impressions_7d integer not null default 0, impressions_30d integer not null default 0, views_7d integer not null default 0, views_30d integer not null default 0, clicks_7d integer not null default 0, clicks_30d integer not null default 0, reservation_clicks_30d integer not null default 0, call_clicks_30d integer not null default 0, website_clicks_30d integer not null default 0, saves_30d integer not null default 0, completed_outings_30d integer not null default 0, negative_signals_30d integer not null default 0,
  ctr_30d numeric not null default 0, conversion_rate_30d numeric not null default 0, engagement_score numeric not null default 0, conversion_score numeric not null default 0, confidence_score numeric not null default 0, intent_score numeric not null default 0, score_version text not null default 'intent_rank_v1', metadata jsonb not null default '{}'::jsonb
);
create index if not exists location_intent_ml_features_location_id_idx on public.location_intent_ml_features(location_id);
create index if not exists location_intent_ml_features_intent_bucket_idx on public.location_intent_ml_features(intent_bucket);
create index if not exists location_intent_ml_features_market_idx on public.location_intent_ml_features(market);
create index if not exists location_intent_ml_features_location_type_idx on public.location_intent_ml_features(location_type);
create index if not exists location_intent_ml_features_intent_score_idx on public.location_intent_ml_features(intent_score desc);
create index if not exists location_intent_ml_features_updated_at_idx on public.location_intent_ml_features(updated_at desc);
create unique index if not exists location_intent_ml_features_unique_idx on public.location_intent_ml_features (location_id, intent_bucket, market_key, location_type_key);
alter table public.location_intent_ml_features enable row level security;

create table if not exists public.location_pair_ml_features (
  id uuid primary key default gen_random_uuid(), restaurant_location_id uuid not null references public.locations(id) on delete cascade, activity_location_id uuid not null references public.locations(id) on delete cascade, intent_bucket text not null, market text null, market_key text not null default '', updated_at timestamptz not null default now(), pair_distance_miles numeric null, estimated_travel_minutes numeric null,
  impressions_7d integer not null default 0, impressions_30d integer not null default 0, clicks_7d integer not null default 0, clicks_30d integer not null default 0, saves_30d integer not null default 0, completed_outings_30d integer not null default 0, reservation_clicks_30d integer not null default 0, call_clicks_30d integer not null default 0, website_clicks_30d integer not null default 0, negative_signals_30d integer not null default 0,
  ctr_30d numeric not null default 0, conversion_rate_30d numeric not null default 0, distance_score numeric not null default 0, engagement_score numeric not null default 0, conversion_score numeric not null default 0, confidence_score numeric not null default 0, pair_score numeric not null default 0, score_version text not null default 'pair_rank_v1', metadata jsonb not null default '{}'::jsonb
);
create index if not exists location_pair_ml_features_restaurant_location_id_idx on public.location_pair_ml_features(restaurant_location_id);
create index if not exists location_pair_ml_features_activity_location_id_idx on public.location_pair_ml_features(activity_location_id);
create index if not exists location_pair_ml_features_intent_bucket_idx on public.location_pair_ml_features(intent_bucket);
create index if not exists location_pair_ml_features_market_idx on public.location_pair_ml_features(market);
create index if not exists location_pair_ml_features_pair_score_idx on public.location_pair_ml_features(pair_score desc);
create index if not exists location_pair_ml_features_updated_at_idx on public.location_pair_ml_features(updated_at desc);
create unique index if not exists location_pair_ml_features_unique_idx on public.location_pair_ml_features (restaurant_location_id, activity_location_id, intent_bucket, market_key);
alter table public.location_pair_ml_features enable row level security;

create table if not exists public.ml_phase2_score_runs (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), status text not null default 'completed', processed_location_intents integer not null default 0, updated_location_intents integer not null default 0, processed_pairs integer not null default 0, updated_pairs integer not null default 0, error_count integer not null default 0, score_version text not null default 'phase2_rank_v1', metadata jsonb not null default '{}'::jsonb
);
create index if not exists ml_phase2_score_runs_created_at_idx on public.ml_phase2_score_runs(created_at desc);
create index if not exists ml_phase2_score_runs_status_idx on public.ml_phase2_score_runs(status);
create index if not exists ml_phase2_score_runs_score_version_idx on public.ml_phase2_score_runs(score_version);
alter table public.ml_phase2_score_runs enable row level security;
