-- Advanced analytics events foundation
create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_type text null,
  user_id uuid null,
  anonymous_id text null,
  session_id text null,
  outing_id uuid null,
  location_id uuid null,
  source_location_id uuid null,
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
  ranking_position int null,
  result_count int null,
  response_time_ms int null,
  conversion_step text null,
  revenue_impact numeric null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events add column if not exists event_name text;
alter table public.analytics_events add column if not exists event_type text;
alter table public.analytics_events add column if not exists anonymous_id text;
alter table public.analytics_events add column if not exists source_location_id uuid;
alter table public.analytics_events add column if not exists owner_id uuid;
alter table public.analytics_events add column if not exists normalized_query text;
alter table public.analytics_events add column if not exists search_intent jsonb;
alter table public.analytics_events add column if not exists device_type text;
alter table public.analytics_events add column if not exists browser text;
alter table public.analytics_events add column if not exists os text;
alter table public.analytics_events add column if not exists city text;
alter table public.analytics_events add column if not exists borough text;
alter table public.analytics_events add column if not exists neighborhood text;
alter table public.analytics_events add column if not exists location_type text;
alter table public.analytics_events add column if not exists category text;
alter table public.analytics_events add column if not exists cuisine text;
alter table public.analytics_events add column if not exists activity_type text;
alter table public.analytics_events add column if not exists ranking_position int;
alter table public.analytics_events add column if not exists result_count int;
alter table public.analytics_events add column if not exists response_time_ms int;
alter table public.analytics_events add column if not exists conversion_step text;
alter table public.analytics_events add column if not exists revenue_impact numeric;

create index if not exists analytics_events_event_name_created_at_idx on public.analytics_events(event_name, created_at desc);
create index if not exists analytics_events_location_id_created_at_idx on public.analytics_events(location_id, created_at desc);
create index if not exists analytics_events_source_location_id_created_at_idx on public.analytics_events(source_location_id, created_at desc);
create index if not exists analytics_events_owner_id_created_at_idx on public.analytics_events(owner_id, created_at desc);
create index if not exists analytics_events_session_id_created_at_idx on public.analytics_events(session_id, created_at desc);
create index if not exists analytics_events_user_id_created_at_idx on public.analytics_events(user_id, created_at desc);
create index if not exists analytics_events_query_created_at_idx on public.analytics_events(normalized_query, created_at desc);
create index if not exists analytics_events_conversion_step_created_at_idx on public.analytics_events(conversion_step, created_at desc);

alter table public.analytics_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='analytics_events' and policyname='analytics_events_service_role_insert'
  ) then
    create policy analytics_events_service_role_insert on public.analytics_events for insert to service_role with check (true);
  end if;
end$$;
