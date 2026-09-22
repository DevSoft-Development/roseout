-- Consolidate advertising onto the existing production promotion engine.
-- The temporary location_ad_* foundation is removed so there is one campaign model.

drop table if exists public.location_ad_budget_ledger cascade;
drop table if exists public.location_ad_events cascade;
drop table if exists public.location_ad_geo_targets cascade;
drop table if exists public.location_ad_campaigns cascade;

alter table public.crm_location_primary_territories enable row level security;
revoke all on public.crm_location_primary_territories from anon, authenticated;
grant select, insert, update, delete on public.crm_location_primary_territories to service_role;

create index if not exists promotion_campaigns_targeting_gin_idx
  on public.promotion_campaigns using gin(targeting);

comment on column public.promotion_campaigns.targeting is
  'Canonical geographic/audience targeting. Supported geo keys: markets, states, counties, cities, boroughs, neighborhoods, zipCodes, territoryIds, radiusMiles, latitude, longitude and matching exclude* arrays.';
