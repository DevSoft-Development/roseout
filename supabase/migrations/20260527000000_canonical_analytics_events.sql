create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text,
  event_type text null,
  user_id uuid null,
  anonymous_id text null,
  session_id text null,
  outing_id uuid null,
  location_id uuid null,
  source_location_id text null,
  owner_id uuid null,
  query text null,
  normalized_query text null,
  search_intent jsonb null,
  page_path text null,
  referrer text null,
  source text null,
  device_type text null,
  browser text null,
  os text null,
  city text null,
  borough text null,
  neighborhood text null,
  location_type text null,
  category text null,
  cuisine text null,
  activity_type text null,
  ranking_position integer null,
  result_count integer null,
  response_time_ms integer null,
  conversion_step text null,
  revenue_impact numeric null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events
  add column if not exists event_name text,
  add column if not exists event_type text null,
  add column if not exists user_id uuid null,
  add column if not exists anonymous_id text null,
  add column if not exists session_id text null,
  add column if not exists outing_id uuid null,
  add column if not exists location_id uuid null,
  add column if not exists source_location_id text null,
  add column if not exists owner_id uuid null,
  add column if not exists query text null,
  add column if not exists normalized_query text null,
  add column if not exists search_intent jsonb null,
  add column if not exists page_path text null,
  add column if not exists referrer text null,
  add column if not exists source text null,
  add column if not exists device_type text null,
  add column if not exists browser text null,
  add column if not exists os text null,
  add column if not exists city text null,
  add column if not exists borough text null,
  add column if not exists neighborhood text null,
  add column if not exists location_type text null,
  add column if not exists category text null,
  add column if not exists cuisine text null,
  add column if not exists activity_type text null,
  add column if not exists ranking_position integer null,
  add column if not exists result_count integer null,
  add column if not exists response_time_ms integer null,
  add column if not exists conversion_step text null,
  add column if not exists revenue_impact numeric null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

update public.analytics_events
set event_name = coalesce(nullif(event_name, ''), nullif(event_type, ''), nullif(metadata->>'event_name', ''), nullif(metadata->>'type', ''), nullif(metadata->>'action', ''), 'unknown_event')
where event_name is null or event_name = '';

alter table public.analytics_events alter column event_name set default 'unknown_event';
update public.analytics_events set event_name = 'unknown_event' where event_name is null or event_name = '';
alter table public.analytics_events alter column event_name set not null;

create index if not exists analytics_events_event_name_created_at_idx on public.analytics_events(event_name, created_at);
create index if not exists analytics_events_event_type_created_at_idx on public.analytics_events(event_type, created_at);
create index if not exists analytics_events_location_id_created_at_idx on public.analytics_events(location_id, created_at);
create index if not exists analytics_events_source_location_id_created_at_idx on public.analytics_events(source_location_id, created_at);
create index if not exists analytics_events_owner_id_created_at_idx on public.analytics_events(owner_id, created_at);
create index if not exists analytics_events_session_id_created_at_idx on public.analytics_events(session_id, created_at);
create index if not exists analytics_events_user_id_created_at_idx on public.analytics_events(user_id, created_at);
create index if not exists analytics_events_normalized_query_created_at_idx on public.analytics_events(normalized_query, created_at);
create index if not exists analytics_events_conversion_step_created_at_idx on public.analytics_events(conversion_step, created_at);

alter table public.outings
  add column if not exists source_location_id text null,
  add column if not exists location_type text null,
  add column if not exists reservation_type text null default 'external',
  add column if not exists external_reservation_url text null,
  add column if not exists phone_number text null,
  add column if not exists contact_method text null,
  add column if not exists reservation_clicked_at timestamptz null,
  add column if not exists call_clicked_at timestamptz null,
  add column if not exists completed_at timestamptz null,
  add column if not exists cancelled_at timestamptz null,
  add column if not exists rating integer null,
  add column if not exists matched_vibe boolean null,
  add column if not exists would_go_again boolean null,
  add column if not exists feedback text null,
  add column if not exists source text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists outings_location_id_created_at_idx on public.outings(location_id, created_at);
create index if not exists outings_source_location_id_created_at_idx on public.outings(source_location_id, created_at);
create index if not exists outings_status_created_at_idx on public.outings(status, created_at);
create index if not exists outings_user_id_created_at_idx on public.outings(user_id, created_at);
