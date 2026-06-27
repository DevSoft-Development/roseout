create extension if not exists pgcrypto;

create table if not exists public.location_review_ml_features (
  location_id uuid primary key references public.locations(id) on delete cascade,
  approved_review_count integer not null default 0,
  verified_review_count integer not null default 0,
  recent_review_count integer not null default 0,
  avg_rating numeric not null default 0,
  avg_ai_score_boost numeric not null default 0,
  positive_review_count integer not null default 0,
  neutral_review_count integer not null default 0,
  negative_review_count integer not null default 0,
  quiet_score numeric not null default 0,
  loud_score numeric not null default 0,
  romantic_score numeric not null default 0,
  group_score numeric not null default 0,
  family_score numeric not null default 0,
  upscale_score numeric not null default 0,
  casual_score numeric not null default 0,
  photo_worthy_score numeric not null default 0,
  lively_score numeric not null default 0,
  relaxed_score numeric not null default 0,
  grown_vibe_score numeric not null default 0,
  date_night_score numeric not null default 0,
  birthday_score numeric not null default 0,
  girls_night_score numeric not null default 0,
  service_score numeric not null default 0,
  food_score numeric not null default 0,
  ambiance_score numeric not null default 0,
  value_score numeric not null default 0,
  overall_review_quality_score numeric not null default 0,
  review_confidence_score numeric not null default 0,
  review_freshness_score numeric not null default 0,
  wait_penalty numeric not null default 0,
  overpriced_penalty numeric not null default 0,
  service_penalty numeric not null default 0,
  noise_penalty numeric not null default 0,
  crowded_penalty numeric not null default 0,
  quiet_mention_count integer not null default 0,
  loud_mention_count integer not null default 0,
  romantic_mention_count integer not null default 0,
  group_mention_count integer not null default 0,
  family_mention_count integer not null default 0,
  photo_worthy_mention_count integer not null default 0,
  service_issue_count integer not null default 0,
  wait_issue_count integer not null default 0,
  value_issue_count integer not null default 0,
  top_positive_terms text[] not null default '{}',
  top_negative_terms text[] not null default '{}',
  best_for_terms text[] not null default '{}',
  avoid_if_terms text[] not null default '{}',
  review_summary text null,
  last_review_at timestamptz null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_ml_score_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'manual',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  status text not null default 'running',
  locations_scanned integer not null default 0,
  locations_updated integer not null default 0,
  reviews_scanned integer not null default 0,
  errors text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_location_review_ml_features_location_id on public.location_review_ml_features(location_id);
create index if not exists idx_location_review_ml_features_quality on public.location_review_ml_features(overall_review_quality_score desc);
create index if not exists idx_location_review_ml_features_confidence on public.location_review_ml_features(review_confidence_score desc);
create index if not exists idx_location_review_ml_features_quiet on public.location_review_ml_features(quiet_score desc);
create index if not exists idx_location_review_ml_features_romantic on public.location_review_ml_features(romantic_score desc);
create index if not exists idx_location_review_ml_features_group on public.location_review_ml_features(group_score desc);
create index if not exists idx_location_review_ml_features_family on public.location_review_ml_features(family_score desc);
create index if not exists idx_location_review_ml_features_lively on public.location_review_ml_features(lively_score desc);
create index if not exists idx_location_review_ml_features_calculated_at on public.location_review_ml_features(calculated_at desc);
create index if not exists idx_review_ml_score_runs_started_at on public.review_ml_score_runs(started_at desc);

alter table public.location_review_ml_features enable row level security;
alter table public.review_ml_score_runs enable row level security;

drop policy if exists "Admins manage location_review_ml_features" on public.location_review_ml_features;
create policy "Admins manage location_review_ml_features" on public.location_review_ml_features for all using (public.is_admin_user(auth.uid())) with check (public.is_admin_user(auth.uid()));
drop policy if exists "Admins manage review_ml_score_runs" on public.review_ml_score_runs;
create policy "Admins manage review_ml_score_runs" on public.review_ml_score_runs for all using (public.is_admin_user(auth.uid())) with check (public.is_admin_user(auth.uid()));

grant select, insert, update, delete on public.location_review_ml_features to authenticated, service_role;
grant select, insert, update, delete on public.review_ml_score_runs to authenticated, service_role;

drop trigger if exists location_review_ml_features_set_updated_at on public.location_review_ml_features;
create trigger location_review_ml_features_set_updated_at before update on public.location_review_ml_features for each row execute function public.set_updated_at();
