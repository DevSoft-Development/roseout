-- Location Intelligence V2 foundation (phases 1-13).
-- Additive and backward compatible: public.locations.id remains the canonical TOH location ID.

create table if not exists public.location_external_identities (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  provider text not null,
  external_id text not null,
  status text not null default 'active' check (status in ('active','superseded','conflict','retired')),
  is_current boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_id)
);
create index if not exists location_external_identities_location_idx
  on public.location_external_identities(location_id, provider, is_current);

create table if not exists public.location_provider_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  provider text not null,
  provider_entity_id text,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text,
  schema_version integer not null default 1,
  processing_version integer not null default 1,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists location_provider_snapshots_location_idx
  on public.location_provider_snapshots(location_id, provider, retrieved_at desc);
create index if not exists location_provider_snapshots_entity_idx
  on public.location_provider_snapshots(provider, provider_entity_id, retrieved_at desc);

create table if not exists public.location_evidence_v2 (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  provider text not null,
  provider_entity_id text,
  evidence_type text not null,
  field_name text not null,
  value jsonb not null,
  confidence numeric(5,4),
  source_url text,
  snapshot_id uuid references public.location_provider_snapshots(id) on delete set null,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists location_evidence_v2_location_idx
  on public.location_evidence_v2(location_id, field_name, observed_at desc);
create index if not exists location_evidence_v2_provider_idx
  on public.location_evidence_v2(provider, evidence_type, observed_at desc);

create table if not exists public.location_provider_registry (
  provider text primary key,
  enabled boolean not null default true,
  priority integer not null default 0,
  capabilities text[] not null default '{}',
  credential_ref text,
  paid boolean not null default false,
  maintenance_class text not null default 'external_free'
    check (maintenance_class in ('external_paid','external_free','first_party','internal')),
  health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','missing_credentials','disabled','degraded','rate_limited','quota_exhausted','unavailable')),
  last_health_check_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.location_intelligence_profiles_v2 (
  location_id uuid primary key references public.locations(id) on delete cascade,
  profile_version integer not null default 1,
  maintenance_mode text not null default 'theouthaven_managed'
    check (maintenance_mode in ('theouthaven_managed','owner_maintained')),
  operational_status text not null default 'unknown'
    check (operational_status in ('active','temporarily_closed','permanently_closed','moved','renamed','reopened','replaced','unknown')),
  quality_score numeric(5,2) not null default 0,
  search_v3_ready boolean not null default false,
  identity jsonb not null default '{}'::jsonb,
  classification jsonb not null default '{}'::jsonb,
  geography jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  occasions jsonb not null default '{}'::jsonb,
  reviews jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  last_initial_enrichment_at timestamptz,
  routine_paid_refresh_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists location_intelligence_profiles_v2_ready_idx
  on public.location_intelligence_profiles_v2(search_v3_ready, quality_score desc);

create table if not exists public.location_review_refresh_state (
  location_id uuid not null references public.locations(id) on delete cascade,
  provider text not null,
  last_review_external_id text,
  last_review_published_at timestamptz,
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz,
  popularity_score numeric(5,2) not null default 0,
  refresh_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(location_id, provider)
);
create index if not exists location_review_refresh_due_idx
  on public.location_review_refresh_state(next_refresh_at)
  where refresh_enabled = true;

create table if not exists public.location_review_intelligence (
  location_id uuid not null references public.locations(id) on delete cascade,
  concept text not null,
  lifetime_count integer not null default 0,
  trailing_12m_count integer not null default 0,
  trailing_90d_count integer not null default 0,
  positive_ratio numeric(5,4),
  negative_ratio numeric(5,4),
  confidence numeric(5,4),
  trend text,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(location_id, concept)
);

create table if not exists public.location_material_change_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  change_type text not null,
  confidence numeric(5,4),
  source text not null,
  status text not null default 'pending'
    check (status in ('pending','verifying','confirmed','dismissed','failed')),
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists location_material_change_pending_idx
  on public.location_material_change_events(status, detected_at desc);

create table if not exists public.location_coverage_targets (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  area_type text not null,
  area_key text not null,
  location_kind text not null,
  category text not null,
  target_count integer not null check (target_count >= 0),
  minimum_count integer not null default 0 check (minimum_count >= 0),
  maximum_count integer,
  demand_weight numeric(6,3) not null default 1,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(market, area_type, area_key, location_kind, category)
);

create table if not exists public.location_coverage_state (
  market text not null,
  area_type text not null,
  area_key text not null,
  location_kind text not null,
  category text not null,
  current_count integer not null default 0,
  target_count integer not null default 0,
  search_demand numeric(10,4) not null default 0,
  result_gap_rate numeric(5,4) not null default 0,
  priority_score numeric(10,4) not null default 0,
  calculated_at timestamptz not null default now(),
  primary key(market, area_type, area_key, location_kind, category)
);

insert into public.location_provider_registry(provider,enabled,priority,capabilities,credential_ref,paid,maintenance_class)
values
  ('google',true,100,array['identity','status_verification'],'google.apiKey',false,'external_free'),
  ('dataforseo',true,90,array['discovery','business_profile','reviews','status_verification'],'dataforseo.login+password',true,'external_paid'),
  ('official_website',true,95,array['website_discovery','web_context','status_verification'],null,false,'first_party'),
  ('mapbox',true,80,array['geocoding','routing'],'mapbox.accessToken',true,'external_paid'),
  ('brave',true,70,array['website_discovery','web_context','status_verification'],'brave.apiKey',true,'external_paid'),
  ('public_geo',true,60,array['geocoding','public_geography'],null,false,'external_free'),
  ('owner',true,120,array['owner_profile'],null,false,'first_party'),
  ('toh_internal',true,110,array['behavior_signals'],null,false,'internal'),
  ('azure_ai',true,50,array['ai_extraction'],null,false,'internal')
on conflict (provider) do update
set enabled=excluded.enabled, priority=excluded.priority, capabilities=excluded.capabilities,
    credential_ref=excluded.credential_ref, paid=excluded.paid,
    maintenance_class=excluded.maintenance_class, updated_at=now();

-- Backfill only Google identities that are currently unambiguous.
insert into public.location_external_identities(location_id,provider,external_id,status,is_current,metadata)
select (min(id::text) filter (where coalesce(duplicate_status,'') <> 'duplicate'))::uuid, 'google', google_place_id, 'active', true, jsonb_build_object('backfill','locations.google_place_id')
from public.locations
where google_place_id is not null and btrim(google_place_id) <> ''
group by google_place_id
having count(*) filter (where coalesce(duplicate_status,'') <> 'duplicate') = 1
on conflict (provider, external_id) do nothing;

-- Queue legacy collisions instead of choosing a winner silently.
insert into public.location_material_change_events(location_id,change_type,confidence,source,evidence)
select min(id::text)::uuid, 'identity_conflict', 1.0, 'v2_google_identity_backfill',
       jsonb_build_object('provider','google','external_id',google_place_id,'candidate_count',count(*),'candidate_location_ids',jsonb_agg(id))
from public.locations
where google_place_id is not null and btrim(google_place_id) <> ''
  and coalesce(duplicate_status,'') <> 'duplicate'
group by google_place_id
having count(*) > 1;

-- Initialize V2 profiles without changing existing publication/search behavior.
insert into public.location_intelligence_profiles_v2(
  location_id, maintenance_mode, operational_status, quality_score, search_v3_ready, identity, routine_paid_refresh_enabled
)
select id,
       case when coalesce(is_claimed,false) or coalesce(claimed,false) or owner_user_id is not null
              or lower(coalesce(claim_status,'')) in ('approved','claimed')
            then 'owner_maintained' else 'theouthaven_managed' end,
       case when coalesce(active,true) then 'active' else 'unknown' end,
       0,
       false,
       jsonb_strip_nulls(jsonb_build_object('google_place_id',google_place_id,'location_key',location_key)),
       false
from public.locations
on conflict (location_id) do nothing;

-- Internal tables: RLS on, no anon/authenticated access.
alter table public.location_external_identities enable row level security;
alter table public.location_provider_snapshots enable row level security;
alter table public.location_evidence_v2 enable row level security;
alter table public.location_provider_registry enable row level security;
alter table public.location_intelligence_profiles_v2 enable row level security;
alter table public.location_review_refresh_state enable row level security;
alter table public.location_review_intelligence enable row level security;
alter table public.location_material_change_events enable row level security;
alter table public.location_coverage_targets enable row level security;
alter table public.location_coverage_state enable row level security;

revoke all on table public.location_external_identities from public, anon, authenticated;
revoke all on table public.location_provider_snapshots from public, anon, authenticated;
revoke all on table public.location_evidence_v2 from public, anon, authenticated;
revoke all on table public.location_provider_registry from public, anon, authenticated;
revoke all on table public.location_intelligence_profiles_v2 from public, anon, authenticated;
revoke all on table public.location_review_refresh_state from public, anon, authenticated;
revoke all on table public.location_review_intelligence from public, anon, authenticated;
revoke all on table public.location_material_change_events from public, anon, authenticated;
revoke all on table public.location_coverage_targets from public, anon, authenticated;
revoke all on table public.location_coverage_state from public, anon, authenticated;

grant select,insert,update,delete on table public.location_external_identities to service_role;
grant select,insert,update,delete on table public.location_provider_snapshots to service_role;
grant select,insert,update,delete on table public.location_evidence_v2 to service_role;
grant select,insert,update,delete on table public.location_provider_registry to service_role;
grant select,insert,update,delete on table public.location_intelligence_profiles_v2 to service_role;
grant select,insert,update,delete on table public.location_review_refresh_state to service_role;
grant select,insert,update,delete on table public.location_review_intelligence to service_role;
grant select,insert,update,delete on table public.location_material_change_events to service_role;
grant select,insert,update,delete on table public.location_coverage_targets to service_role;
grant select,insert,update,delete on table public.location_coverage_state to service_role;

comment on table public.location_external_identities is 'Provider identities mapped to canonical TOH location UUIDs. Google is the first duplicate anchor, not the primary key.';
comment on table public.location_intelligence_profiles_v2 is 'Canonical Search V3-ready Location Intelligence V2 profile. Routine paid profile refresh is disabled by design.';
comment on table public.location_review_refresh_state is 'Incremental external review cursor and demand-sensitive refresh schedule.';
comment on table public.location_material_change_events is 'Event-driven material status/identity changes requiring targeted verification.';
comment on table public.location_coverage_targets is 'Heat-zone/coverage inventory targets used for balanced location discovery.';
