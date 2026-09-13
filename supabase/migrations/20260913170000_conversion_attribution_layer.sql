-- TheOutHaven conversion attribution layer
-- External-site conversion events continue to use public.analytics_events.

create table if not exists public.location_attributions (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  search_id uuid null,
  session_id text null,
  destination_url text not null,
  landing_url text null,
  search_query text null,
  result_position integer null,
  source text not null default 'theouthaven',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists location_attributions_location_created_idx
  on public.location_attributions (location_id, created_at desc);
create index if not exists location_attributions_search_idx
  on public.location_attributions (search_id)
  where search_id is not null;

alter table public.location_attributions enable row level security;
revoke all on table public.location_attributions from anon, authenticated;

create table if not exists public.location_website_tracking (
  location_id uuid primary key references public.locations(id) on delete cascade,
  site_key uuid not null unique default gen_random_uuid(),
  enabled boolean not null default true,
  allowed_origins text[] not null default '{}'::text[],
  verified_at timestamptz null,
  last_seen_at timestamptz null,
  average_customer_value numeric(12,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists location_website_tracking_site_key_idx
  on public.location_website_tracking (site_key);

alter table public.location_website_tracking enable row level security;
revoke all on table public.location_website_tracking from anon, authenticated;

comment on table public.location_attributions is 'Opaque attribution tokens connecting TheOutHaven discovery to external-site activity.';
comment on table public.location_website_tracking is 'Per-location external website tracking configuration. Accessed server-side only.';
