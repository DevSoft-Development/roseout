-- Search V3 graph-authoritative geography enrichment.
-- Geography type, canonical name, centroid and hierarchy are derived from production
-- location_search_profiles instead of static application dictionaries.

with geo_source as (
  select
    'market'::text as entity_type,
    trim(p.market) as canonical_name,
    p.latitude,
    p.longitude,
    p.city,
    p.borough,
    p.neighborhood,
    l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where nullif(trim(p.market), '') is not null
  union all
  select 'city', trim(p.city), p.latitude, p.longitude, p.city, p.borough, p.neighborhood, l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where nullif(trim(p.city), '') is not null
  union all
  select 'borough', trim(p.borough), p.latitude, p.longitude, p.city, p.borough, p.neighborhood, l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where nullif(trim(p.borough), '') is not null
  union all
  select 'neighborhood', trim(p.neighborhood), p.latitude, p.longitude, p.city, p.borough, p.neighborhood, l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where nullif(trim(p.neighborhood), '') is not null
  union all
  select 'zip_code', trim(l.zip_code), p.latitude, p.longitude, p.city, p.borough, p.neighborhood, l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where nullif(trim(l.zip_code), '') is not null
),
geo_rollup as (
  select
    entity_type,
    canonical_name,
    avg(latitude) filter (where latitude is not null) as latitude,
    avg(longitude) filter (where longitude is not null) as longitude,
    array_remove(array_agg(distinct nullif(trim(city), '')), null) as cities,
    array_remove(array_agg(distinct nullif(trim(borough), '')), null) as boroughs,
    array_remove(array_agg(distinct nullif(trim(neighborhood), '')), null) as neighborhoods,
    array_remove(array_agg(distinct nullif(trim(zip_code), '')), null) as zip_codes,
    count(*) as source_location_count
  from geo_source
  group by entity_type, canonical_name
)
update public.knowledge_entities e
set
  attributes = coalesce(e.attributes, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'latitude', g.latitude,
    'longitude', g.longitude,
    'cities', to_jsonb(g.cities),
    'boroughs', to_jsonb(g.boroughs),
    'neighborhoods', to_jsonb(g.neighborhoods),
    'zipCodes', to_jsonb(g.zip_codes),
    'sourceLocationCount', g.source_location_count,
    'geographyAuthority', 'location_search_profiles'
  )),
  source_updated_at = now(),
  updated_at = now()
from geo_rollup g
where e.entity_type = g.entity_type
  and lower(trim(regexp_replace(trim(e.canonical_name), '[^[:alnum:]]+', ' ', 'g'))) =
      lower(trim(regexp_replace(trim(g.canonical_name), '[^[:alnum:]]+', ' ', 'g')));

comment on table public.knowledge_entities is
  'Search V3 knowledge graph entities. Geography entities are authoritative for canonical geography type/name and carry database-derived centroid/hierarchy attributes.';
