-- Unified geography, canonical consumer profile geography, CRM scope hardening,
-- and business geographic advertising foundation.

create table if not exists public.geo_postal_areas (
  zip_code text primary key,
  city text,
  primary_neighborhood text,
  borough text,
  county text,
  state text,
  market text,
  latitude double precision,
  longitude double precision,
  neighborhood_candidates jsonb not null default '[]'::jsonb,
  source text not null default 'location_inventory',
  confidence numeric(5,4) not null default 0.7000,
  is_supported_market boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_postal_areas_zip5 check (zip_code ~ '^[0-9]{5}$'),
  constraint geo_postal_areas_confidence check (confidence >= 0 and confidence <= 1)
);

create index if not exists geo_postal_areas_market_idx on public.geo_postal_areas(market, zip_code);
create index if not exists geo_postal_areas_city_idx on public.geo_postal_areas(state, city, zip_code);
create index if not exists geo_postal_areas_county_idx on public.geo_postal_areas(state, county, zip_code);

-- Seed from the existing location inventory. The most recently maintained searchable
-- location is used as the representative row; the table is a cache and can be refined
-- independently without rewriting location records.
insert into public.geo_postal_areas (
  zip_code, city, primary_neighborhood, borough, county, state, market,
  latitude, longitude, source, confidence, is_supported_market, updated_at
)
select distinct on (left(regexp_replace(coalesce(l.zip_code,l.postal_code,''),'[^0-9]','','g'),5))
  left(regexp_replace(coalesce(l.zip_code,l.postal_code,''),'[^0-9]','','g'),5) as zip_code,
  nullif(trim(l.city),''),
  nullif(trim(l.neighborhood),''),
  nullif(trim(l.borough),''),
  nullif(trim(l.county),''),
  nullif(upper(trim(l.state)),''),
  nullif(trim(l.market),''),
  l.latitude::double precision,
  l.longitude::double precision,
  'location_inventory',
  case when l.latitude is not null and l.longitude is not null then 0.8500 else 0.6500 end,
  coalesce(l.market in ('NYC','NYC_CORE','LONG_ISLAND','NORTHERN_NJ','WESTCHESTER','CONNECTICUT'), false),
  now()
from public.locations l
where length(regexp_replace(coalesce(l.zip_code,l.postal_code,''),'[^0-9]','','g')) >= 5
order by
  left(regexp_replace(coalesce(l.zip_code,l.postal_code,''),'[^0-9]','','g'),5),
  coalesce(l.is_searchable,false) desc,
  l.updated_at desc nulls last
on conflict (zip_code) do update set
  city = coalesce(excluded.city, public.geo_postal_areas.city),
  primary_neighborhood = coalesce(excluded.primary_neighborhood, public.geo_postal_areas.primary_neighborhood),
  borough = coalesce(excluded.borough, public.geo_postal_areas.borough),
  county = coalesce(excluded.county, public.geo_postal_areas.county),
  state = coalesce(excluded.state, public.geo_postal_areas.state),
  market = coalesce(excluded.market, public.geo_postal_areas.market),
  latitude = coalesce(excluded.latitude, public.geo_postal_areas.latitude),
  longitude = coalesce(excluded.longitude, public.geo_postal_areas.longitude),
  confidence = greatest(public.geo_postal_areas.confidence, excluded.confidence),
  is_supported_market = public.geo_postal_areas.is_supported_market or excluded.is_supported_market,
  updated_at = now();

alter table public.consumer_profiles
  add column if not exists home_zip_code text,
  add column if not exists home_county text,
  add column if not exists home_market text,
  add column if not exists home_latitude double precision,
  add column if not exists home_longitude double precision,
  add column if not exists home_geo_source text,
  add column if not exists home_geo_confidence numeric(5,4),
  add column if not exists home_geo_updated_at timestamptz;

create index if not exists consumer_profiles_home_zip_idx on public.consumer_profiles(home_zip_code);
create index if not exists consumer_profiles_home_market_idx on public.consumer_profiles(home_market);

create or replace function public.normalize_zip5(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(regexp_replace(coalesce(p_value,''),'[^0-9]','','g')) >= 5
      then left(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),5)
    else null
  end;
$$;

create or replace function public.apply_consumer_profile_home_geo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_zip text;
  area public.geo_postal_areas%rowtype;
begin
  normalized_zip := public.normalize_zip5(new.home_zip_code);
  new.home_zip_code := normalized_zip;

  if normalized_zip is null then
    new.home_neighborhood := null;
    new.home_borough := null;
    new.home_city := null;
    new.home_county := null;
    new.home_state := null;
    new.home_market := null;
    new.home_latitude := null;
    new.home_longitude := null;
    new.home_geo_source := null;
    new.home_geo_confidence := null;
    new.home_geo_updated_at := now();
    return new;
  end if;

  select * into area
  from public.geo_postal_areas
  where zip_code = normalized_zip and is_active = true;

  if found then
    new.home_neighborhood := area.primary_neighborhood;
    new.home_borough := area.borough;
    new.home_city := area.city;
    new.home_county := area.county;
    new.home_state := area.state;
    new.home_market := area.market;
    new.home_latitude := area.latitude;
    new.home_longitude := area.longitude;
    new.home_geo_source := area.source;
    new.home_geo_confidence := area.confidence;
  else
    -- Keep the valid ZIP even when enrichment is not known yet. A later cache fill
    -- can resolve the derived fields without blocking signup/profile edits.
    new.home_neighborhood := null;
    new.home_borough := null;
    new.home_city := null;
    new.home_county := null;
    new.home_state := null;
    new.home_market := null;
    new.home_latitude := null;
    new.home_longitude := null;
    new.home_geo_source := 'unresolved';
    new.home_geo_confidence := 0;
  end if;
  new.home_geo_updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_consumer_profiles_home_geo on public.consumer_profiles;
create trigger trg_consumer_profiles_home_geo
before insert or update of home_zip_code
on public.consumer_profiles
for each row execute function public.apply_consumer_profile_home_geo();

-- Backfill from legacy profile ZIP only when the canonical consumer profile does not
-- already have a ZIP. Do not reverse-guess ZIPs from neighborhoods.
update public.consumer_profiles cp
set home_zip_code = public.normalize_zip5(up.zip_code)
from public.user_profiles up
where up.user_id = cp.user_id
  and cp.home_zip_code is null
  and public.normalize_zip5(up.zip_code) is not null;

-- Re-run the trigger for existing canonical ZIP values.
update public.consumer_profiles
set home_zip_code = home_zip_code
where home_zip_code is not null;

-- ZIP/county are valid territory dimensions. Add county without replacing any existing
-- market/state/city/town/ZIP/borough/neighborhood scopes.
alter table public.crm_territory_scopes
  drop constraint if exists crm_territory_scopes_scope_type_check;
alter table public.crm_territory_scopes
  add constraint crm_territory_scopes_scope_type_check
  check (scope_type in ('market','state','county','city','town','zip','borough','neighborhood'));

create table if not exists public.crm_location_primary_territories (
  location_id uuid primary key references public.locations(id) on delete cascade,
  territory_id uuid references public.crm_territories(id) on delete set null,
  assignment_source text not null default 'automatic'
    check (assignment_source in ('automatic','manual')),
  matched_scope_type text,
  matched_scope_value text,
  assignment_priority integer not null default 0,
  manual_override boolean not null default false,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_location_primary_territories_territory_idx
  on public.crm_location_primary_territories(territory_id);

-- Paid on-platform advertising is separate from consented email/SMS messaging.
create table if not exists public.location_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  created_by uuid,
  name text not null,
  goal text not null default 'awareness',
  status text not null default 'draft'
    check (status in ('draft','pending_review','approved','scheduled','active','paused','completed','rejected')),
  starts_at timestamptz,
  ends_at timestamptz,
  daily_budget_cents integer not null default 0 check (daily_budget_cents >= 0),
  total_budget_cents integer not null default 0 check (total_budget_cents >= 0),
  amount_spent_cents integer not null default 0 check (amount_spent_cents >= 0),
  placement_types text[] not null default array['search']::text[],
  creative jsonb not null default '{}'::jsonb,
  approval_notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists location_ad_campaigns_location_idx on public.location_ad_campaigns(location_id,status);
create index if not exists location_ad_campaigns_active_idx on public.location_ad_campaigns(status,starts_at,ends_at);

create table if not exists public.location_ad_geo_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.location_ad_campaigns(id) on delete cascade,
  target_type text not null
    check (target_type in ('market','state','county','city','borough','neighborhood','zip','territory','radius')),
  target_value text,
  include boolean not null default true,
  latitude double precision,
  longitude double precision,
  radius_miles numeric(8,2),
  created_at timestamptz not null default now(),
  constraint location_ad_geo_target_radius check (
    target_type <> 'radius' or (latitude is not null and longitude is not null and radius_miles is not null and radius_miles > 0)
  )
);
create index if not exists location_ad_geo_targets_lookup_idx
  on public.location_ad_geo_targets(target_type,target_value,campaign_id);

create table if not exists public.location_ad_events (
  id bigint generated by default as identity primary key,
  campaign_id uuid not null references public.location_ad_campaigns(id) on delete cascade,
  advertiser_location_id uuid not null references public.locations(id) on delete cascade,
  event_type text not null
    check (event_type in ('impression','click','profile_view','save','outing_add','reservation_click','reservation','offer_claim','event_booking','experience_booking')),
  placement text,
  search_event_id uuid,
  geo_bucket_type text,
  geo_bucket_value text,
  session_id text,
  anonymous_id text,
  user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists location_ad_events_campaign_time_idx
  on public.location_ad_events(campaign_id,occurred_at desc);
create index if not exists location_ad_events_geo_idx
  on public.location_ad_events(geo_bucket_type,geo_bucket_value,occurred_at desc);

create table if not exists public.location_ad_budget_ledger (
  id bigint generated by default as identity primary key,
  campaign_id uuid not null references public.location_ad_campaigns(id) on delete cascade,
  amount_cents integer not null,
  entry_type text not null check (entry_type in ('authorization','spend','credit','refund','adjustment')),
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists location_ad_budget_ledger_campaign_idx
  on public.location_ad_budget_ledger(campaign_id,created_at desc);

alter table public.geo_postal_areas enable row level security;
alter table public.location_ad_campaigns enable row level security;
alter table public.location_ad_geo_targets enable row level security;
alter table public.location_ad_events enable row level security;
alter table public.location_ad_budget_ledger enable row level security;

revoke all on public.geo_postal_areas from anon, authenticated;
revoke all on public.location_ad_campaigns from anon, authenticated;
revoke all on public.location_ad_geo_targets from anon, authenticated;
revoke all on public.location_ad_events from anon, authenticated;
revoke all on public.location_ad_budget_ledger from anon, authenticated;

grant select, insert, update, delete on public.geo_postal_areas to service_role;
grant select, insert, update, delete on public.location_ad_campaigns to service_role;
grant select, insert, update, delete on public.location_ad_geo_targets to service_role;
grant select, insert, update, delete on public.location_ad_events to service_role;
grant select, insert, update, delete on public.location_ad_budget_ledger to service_role;
