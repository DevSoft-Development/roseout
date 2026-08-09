-- TheOutHaven Canonical Event Inventory
-- Additive only: introduces event inventory and provider-source identity without
-- native ticketing, payments, payouts, or event admission/check-in behavior.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete set null,
  location_id uuid null references public.locations(id) on delete set null,
  source_kind text not null default 'provider',
  title text not null,
  description text null,
  category text null,
  subcategory text null,
  venue_name text null,
  address text null,
  city text null,
  state text null,
  zip_code text null,
  market text null,
  borough text null,
  county text null,
  latitude double precision null,
  longitude double precision null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  timezone text not null default 'America/New_York',
  all_day boolean not null default false,
  price_min numeric(10,2) null,
  price_max numeric(10,2) null,
  currency text null,
  is_free boolean not null default false,
  external_url text null,
  image_url text null,
  status text not null default 'draft',
  searchable boolean not null default false,
  dedupe_fingerprint text not null,
  search_document text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_blank check (length(trim(title)) > 0),
  constraint events_source_kind_check check (source_kind in ('provider','native')),
  constraint events_status_check check (status in ('draft','scheduled','postponed','cancelled','completed')),
  constraint events_date_order_check check (ends_at is null or ends_at >= starts_at),
  constraint events_price_min_check check (price_min is null or price_min >= 0),
  constraint events_price_max_check check (price_max is null or price_max >= 0),
  constraint events_price_order_check check (price_min is null or price_max is null or price_max >= price_min),
  constraint events_dedupe_not_blank check (length(trim(dedupe_fingerprint)) > 0),
  unique (dedupe_fingerprint)
);

create index if not exists events_public_upcoming_idx
  on public.events(starts_at, market)
  where searchable = true and status in ('scheduled','postponed');
create index if not exists events_org_idx on public.events(organization_id, starts_at desc);
create index if not exists events_location_idx on public.events(location_id, starts_at desc);
create index if not exists events_market_city_idx on public.events(market, city, starts_at);

create table if not exists public.event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  source_url text null,
  provider_payload jsonb not null default '{}'::jsonb,
  provider_updated_at timestamptz null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sources_provider_check check (provider in ('ticketmaster','nyc_events','nyc_parks','native')),
  constraint event_sources_provider_id_not_blank check (length(trim(provider_event_id)) > 0),
  unique (provider, provider_event_id)
);

create index if not exists event_sources_event_idx on public.event_sources(event_id);
create index if not exists event_sources_last_seen_idx on public.event_sources(provider, last_seen_at desc);

alter table public.events enable row level security;
alter table public.event_sources enable row level security;

-- Public event inventory is intentionally read-only in the browser. All provider
-- ingestion, normalization, dedupe, organization linkage, and moderation writes
-- are server-only through trusted application code/service-role access.
revoke insert, update, delete, truncate, references, trigger on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
revoke all on public.event_sources from anon, authenticated;
grant all on public.events, public.event_sources to service_role;

-- Only live, public, non-ended events are exposed through the Data API.
drop policy if exists events_public_select on public.events;
create policy events_public_select
  on public.events
  for select
  to anon, authenticated
  using (
    searchable = true
    and status in ('scheduled','postponed')
    and coalesce(ends_at, starts_at) >= now()
  );

comment on table public.events is 'Canonical event inventory shared by provider-sourced and future native organizer events. Ticket orders and admission are separate future domains.';
comment on table public.event_sources is 'Server-only provider identity and raw-source provenance for canonical events. Multiple providers may point at one deduplicated event.';
