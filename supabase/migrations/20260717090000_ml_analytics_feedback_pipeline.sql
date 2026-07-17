alter table public.analytics_events
  add column if not exists schema_version integer not null default 1,
  add column if not exists canonical_event_name text,
  add column if not exists search_id uuid,
  add column if not exists query_fingerprint text,
  add column if not exists pair_id text,
  add column if not exists feedback_polarity text,
  add column if not exists feedback_weight numeric,
  add column if not exists dedupe_key text,
  add column if not exists is_bot boolean not null default false,
  add column if not exists occurred_at timestamptz,
  add column if not exists ingested_at timestamptz not null default now();

update public.analytics_events set canonical_event_name = event_name, occurred_at = coalesce(created_at, now())
where canonical_event_name is null or occurred_at is null;

create index if not exists analytics_events_canonical_occurred_idx on public.analytics_events(canonical_event_name, occurred_at);
create index if not exists analytics_events_search_id_idx on public.analytics_events(search_id);
create index if not exists analytics_events_pair_id_idx on public.analytics_events(pair_id);
create index if not exists analytics_events_query_fingerprint_idx on public.analytics_events(query_fingerprint);
create index if not exists analytics_events_user_occurred_idx on public.analytics_events(user_id, occurred_at);
create index if not exists analytics_events_anonymous_occurred_idx on public.analytics_events(anonymous_id, occurred_at);
create index if not exists analytics_events_session_occurred_idx on public.analytics_events(session_id, occurred_at);
create index if not exists analytics_events_location_occurred_idx on public.analytics_events(location_id, occurred_at);
create unique index if not exists analytics_events_dedupe_key_uidx on public.analytics_events(dedupe_key) where dedupe_key is not null;
