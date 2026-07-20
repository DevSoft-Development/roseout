-- Phase 2 behavioral feature system: canonical event linkage, confidence, freshness, and real aggregatable feature rows.

alter table if exists public.analytics_events
  add column if not exists search_event_id uuid,
  add column if not exists result_impression_id text,
  add column if not exists result_type text,
  add column if not exists rendered_position integer,
  add column if not exists seen_position integer,
  add column if not exists lane text,
  add column if not exists base_score numeric,
  add column if not exists behavioral_boost numeric,
  add column if not exists final_score numeric,
  add column if not exists ranking_version text,
  add column if not exists feature_version text,
  add column if not exists experiment_id text,
  add column if not exists market_key text,
  add column if not exists restaurant_location_id uuid,
  add column if not exists activity_location_id uuid,
  add column if not exists pair_key text;

create index if not exists analytics_events_search_event_id_idx on public.analytics_events(search_event_id);
create index if not exists analytics_events_result_impression_id_idx on public.analytics_events(result_impression_id);
create index if not exists analytics_events_pair_key_idx on public.analytics_events(pair_key);
create unique index if not exists analytics_events_dedupe_key_unique_idx on public.analytics_events(dedupe_key) where dedupe_key is not null;

alter table if exists public.search_result_ml_features
  add column if not exists feature_window text default '30d',
  add column if not exists impression_count integer default 0,
  add column if not exists seen_impression_count integer default 0,
  add column if not exists reservation_start_count integer default 0,
  add column if not exists reservation_complete_count integer default 0,
  add column if not exists call_count integer default 0,
  add column if not exists website_click_count integer default 0,
  add column if not exists outing_complete_count integer default 0,
  add column if not exists immediate_research_count integer default 0,
  add column if not exists seen_ctr numeric default 0,
  add column if not exists relative_ctr numeric default 1,
  add column if not exists save_rate numeric default 0,
  add column if not exists conversion_rate numeric default 0,
  add column if not exists completion_rate numeric default 0,
  add column if not exists negative_feedback_rate numeric default 0,
  add column if not exists immediate_research_rate numeric default 0,
  add column if not exists sample_size integer default 0,
  add column if not exists confidence_score numeric default 0,
  add column if not exists calculated_at timestamptz default now(),
  add column if not exists data_window_start timestamptz,
  add column if not exists data_window_end timestamptz,
  add column if not exists feature_version text default 'behavioral_phase2_v1',
  add column if not exists status text default 'missing';

alter table if exists public.location_pair_ml_features
  add column if not exists pair_key text,
  add column if not exists seen_impression_count integer default 0,
  add column if not exists outing_created_count integer default 0,
  add column if not exists pair_replacement_count integer default 0,
  add column if not exists immediate_research_count integer default 0,
  add column if not exists sample_size integer default 0,
  add column if not exists data_window_start timestamptz,
  add column if not exists data_window_end timestamptz,
  add column if not exists feature_version text default 'behavioral_phase2_v1',
  add column if not exists status text default 'missing';

update public.location_pair_ml_features
set pair_key = lower(restaurant_location_id::text || ':' || activity_location_id::text)
where pair_key is null and restaurant_location_id is not null and activity_location_id is not null;

create index if not exists location_pair_ml_features_stable_pair_key_idx on public.location_pair_ml_features(pair_key);

alter table if exists public.market_ml_features
  add column if not exists sample_size integer default 0,
  add column if not exists calculated_at timestamptz default now(),
  add column if not exists data_window_start timestamptz,
  add column if not exists data_window_end timestamptz,
  add column if not exists feature_version text default 'behavioral_phase2_v1',
  add column if not exists status text default 'missing';

alter table if exists public.time_of_day_ml_features
  add column if not exists sample_size integer default 0,
  add column if not exists calculated_at timestamptz default now(),
  add column if not exists data_window_start timestamptz,
  add column if not exists data_window_end timestamptz,
  add column if not exists feature_version text default 'behavioral_phase2_v1',
  add column if not exists status text default 'missing';

alter table if exists public.user_preference_ml_features
  add column if not exists sample_size integer default 0,
  add column if not exists calculated_at timestamptz default now(),
  add column if not exists data_window_start timestamptz,
  add column if not exists data_window_end timestamptz,
  add column if not exists feature_version text default 'behavioral_phase2_v1',
  add column if not exists status text default 'missing',
  add column if not exists shadow_mode boolean default true;

create table if not exists public.behavioral_position_baselines (
  id uuid primary key default gen_random_uuid(),
  position integer not null,
  result_type text not null,
  market_key text not null default '',
  device_class text not null default '',
  intent_bucket text not null default '',
  seen_impression_count integer not null default 0,
  click_count integer not null default 0,
  expected_ctr numeric not null default 0,
  confidence_score numeric not null default 0,
  calculated_at timestamptz not null default now(),
  data_window_start timestamptz,
  data_window_end timestamptz,
  feature_version text not null default 'behavioral_phase2_v1',
  status text not null default 'missing',
  unique(position, result_type, market_key, device_class, intent_bucket, feature_version)
);

create table if not exists public.behavioral_feature_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_scanned integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  records_failed integer not null default 0,
  feature_version text not null default 'behavioral_phase2_v1',
  source_window_start timestamptz,
  source_window_end timestamptz,
  dry_run boolean not null default false,
  target_location_id uuid,
  target_market_key text,
  error_samples jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists behavioral_feature_runs_type_created_idx on public.behavioral_feature_runs(run_type, started_at desc);
