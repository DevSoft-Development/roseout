begin;

create table if not exists public.search_result_impressions (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  search_id text not null,
  session_id text not null,
  query_hash text null,
  location_id uuid null references public.locations(id) on delete set null,
  restaurant_location_id uuid null references public.locations(id) on delete set null,
  activity_location_id uuid null references public.locations(id) on delete set null,
  result_type text not null check (
    result_type in ('restaurant', 'activity', 'pair', 'matched_location')
  ),
  result_position integer not null check (result_position > 0),
  intent_bucket text null,
  market text null,
  ranking_version text null,
  experiment_variant text null,
  base_score numeric null,
  phase1_score numeric null,
  phase2_score numeric null,
  final_score numeric null,
  visible_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists search_result_impressions_dedupe_key_idx
  on public.search_result_impressions (dedupe_key);

create index if not exists search_result_impressions_search_idx
  on public.search_result_impressions (search_id);

create index if not exists search_result_impressions_session_idx
  on public.search_result_impressions (session_id);

create index if not exists search_result_impressions_created_idx
  on public.search_result_impressions (created_at desc);

create index if not exists search_result_impressions_location_idx
  on public.search_result_impressions (location_id);

create index if not exists search_result_impressions_pair_idx
  on public.search_result_impressions (
    restaurant_location_id,
    activity_location_id
  );

alter table public.search_result_impressions enable row level security;

alter table public.search_negative_feedback
  add column if not exists search_id text null,
  add column if not exists impression_id uuid null
    references public.search_result_impressions(id) on delete set null,
  add column if not exists result_type text null,
  add column if not exists result_position integer null,
  add column if not exists query_hash text null,
  add column if not exists dedupe_key text null,
  add column if not exists status text not null default 'new',
  add column if not exists resolved_at timestamptz null,
  add column if not exists resolved_by uuid null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists search_negative_feedback_dedupe_key_idx
  on public.search_negative_feedback (dedupe_key)
  where dedupe_key is not null;

create index if not exists search_negative_feedback_search_id_idx
  on public.search_negative_feedback (search_id);

create index if not exists search_negative_feedback_search_event_idx
  on public.search_negative_feedback (search_event_id);

create index if not exists search_negative_feedback_created_idx
  on public.search_negative_feedback (created_at desc);

create index if not exists search_negative_feedback_status_idx
  on public.search_negative_feedback (status);

create index if not exists search_negative_feedback_location_idx
  on public.search_negative_feedback (location_id);

create index if not exists search_negative_feedback_pair_idx
  on public.search_negative_feedback (
    restaurant_location_id,
    activity_location_id
  );

commit;
