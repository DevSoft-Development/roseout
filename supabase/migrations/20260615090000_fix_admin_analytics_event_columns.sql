alter table if exists public.search_events
  add column if not exists source text,
  add column if not exists route text,
  add column if not exists environment text,
  add column if not exists raw_query text,
  add column if not exists normalized_query text,
  add column if not exists search_query text,
  add column if not exists search_type text,
  add column if not exists primary_domain text,
  add column if not exists intent_parser_source text,
  add column if not exists anonymous_id text,
  add column if not exists session_id text,
  add column if not exists beta_tester_id text,
  add column if not exists beta_assignment_id text,
  add column if not exists default_market_id text,
  add column if not exists borough text,
  add column if not exists neighborhood text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists radius_miles numeric,
  add column if not exists outing_date date,
  add column if not exists outing_time time,
  add column if not exists outing_datetime text,
  add column if not exists outing_time_label text,
  add column if not exists restaurant_count integer default 0,
  add column if not exists activity_count integer default 0,
  add column if not exists pair_count integer default 0,
  add column if not exists result_count integer default 0,
  add column if not exists pair_candidates_evaluated integer default 0,
  add column if not exists valid_pair_count_before_render integer default 0,
  add column if not exists wants_pairing boolean default false,
  add column if not exists needs_restaurant boolean default false,
  add column if not exists needs_activity boolean default false,
  add column if not exists distance_mode text,
  add column if not exists max_pair_distance_miles numeric,
  add column if not exists max_pair_walking_minutes numeric,
  add column if not exists timing_ms integer,
  add column if not exists llm_ms integer,
  add column if not exists rpc_ms integer,
  add column if not exists pairing_ms integer,
  add column if not exists ranking_ms integer,
  add column if not exists speed_status text,
  add column if not exists success boolean default true,
  add column if not exists had_issue boolean default false,
  add column if not exists issue_type text,
  add column if not exists issue_label text,
  add column if not exists no_results_reason text,
  add column if not exists no_pairs_reason text,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table if exists public.analytics_events
  add column if not exists normalized_query text,
  add column if not exists search_intent jsonb default '{}'::jsonb,
  add column if not exists outing_id uuid,
  add column if not exists cuisine text,
  add column if not exists activity_type text,
  add column if not exists result_count integer,
  add column if not exists response_time_ms integer,
  add column if not exists conversion_step text,
  add column if not exists revenue_impact numeric,
  add column if not exists metadata jsonb default '{}'::jsonb;

update public.search_events
set raw_query = coalesce(raw_query, search_query)
where raw_query is null and search_query is not null;

update public.search_events
set search_query = coalesce(search_query, raw_query)
where search_query is null and raw_query is not null;

create index if not exists idx_search_events_created_at on public.search_events(created_at desc);
create index if not exists idx_search_events_raw_query on public.search_events(raw_query);
create index if not exists idx_search_events_normalized_query on public.search_events(normalized_query);
create index if not exists idx_search_events_speed_status on public.search_events(speed_status);
create index if not exists idx_search_events_success on public.search_events(success);
create index if not exists idx_search_events_issue_type on public.search_events(issue_type);
