begin;

-- Search V3 Phase 3 production graph seed.
-- Run on the writable East primary only. West receives rows through logical replication.
-- Idempotent by entity keys, alias keys, edge uniqueness, and feature uniqueness.

with eligible as (
  select
    p.*,
    l.name,
    l.restaurant_name,
    l.activity_name,
    l.business_name,
    l.normalized_name,
    l.zip_code,
    l.address,
    l.rating,
    l.review_count,
    l.quality_score,
    l.theouthaven_score,
    l.is_verified,
    l.operating_hours,
    l.updated_at as location_updated_at
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
location_rows as (
  select
    location_id,
    coalesce(
      nullif(trim(name), ''),
      nullif(trim(restaurant_name), ''),
      nullif(trim(activity_name), ''),
      nullif(trim(business_name), ''),
      nullif(trim(normalized_name), ''),
      location_id::text
    ) as canonical_name,
    primary_domain,
    supported_domains,
    profile_version,
    profile_hash,
    generated_at,
    updated_at,
    verified_at,
    confidence,
    market,
    city,
    neighborhood,
    borough,
    state,
    zip_code,
    latitude,
    longitude,
    address,
    rating,
    review_count,
    quality_score,
    theouthaven_score,
    is_verified,
    operating_hours
  from eligible
)
insert into public.knowledge_entities (
  entity_type,
  canonical_key,
  canonical_name,
  location_id,
  attributes,
  confidence,
  source,
  source_updated_at,
  updated_at
)
select
  'location',
  'location:' || location_id::text,
  canonical_name,
  location_id,
  jsonb_strip_nulls(jsonb_build_object(
    'primaryDomain', primary_domain,
    'supportedDomains', supported_domains,
    'profileVersion', profile_version,
    'profileHash', profile_hash,
    'market', market,
    'city', city,
    'neighborhood', neighborhood,
    'borough', borough,
    'state', state,
    'zipCode', zip_code,
    'latitude', latitude,
    'longitude', longitude,
    'address', address,
    'rating', rating,
    'reviewCount', review_count,
    'qualityScore', quality_score,
    'theOutHavenScore', theouthaven_score,
    'verified', is_verified,
    'operatingHours', operating_hours
  )),
  greatest(0, least(1, coalesce(confidence, 0.75))),
  'location_intelligence',
  coalesce(updated_at, generated_at),
  now()
from location_rows
on conflict (entity_type, canonical_key) do update set
  canonical_name = excluded.canonical_name,
  location_id = excluded.location_id,
  attributes = excluded.attributes,
  confidence = excluded.confidence,
  source = excluded.source,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

with eligible as (
  select p.*, l.name, l.restaurant_name, l.activity_name, l.business_name, l.normalized_name
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
aliases as (
  select location_id, alias
  from eligible
  cross join lateral unnest(array[
    name,
    restaurant_name,
    activity_name,
    business_name,
    normalized_name
  ]::text[]) as alias
  where nullif(trim(alias), '') is not null
),
normalized as (
  select
    location_id,
    min(trim(alias)) as alias,
    lower(trim(regexp_replace(trim(alias), '[^[:alnum:]]+', ' ', 'g'))) as normalized_alias
  from aliases
  group by
    location_id,
    lower(trim(regexp_replace(trim(alias), '[^[:alnum:]]+', ' ', 'g')))
)
insert into public.knowledge_entity_aliases (
  entity_id,
  alias,
  normalized_alias,
  source,
  confidence
)
select
  e.id,
  n.alias,
  n.normalized_alias,
  'location_intelligence',
  1
from normalized n
join public.knowledge_entities e
  on e.entity_type = 'location'
 and e.canonical_key = 'location:' || n.location_id::text
where n.normalized_alias <> ''
on conflict (entity_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  confidence = excluded.confidence;

with eligible as (
  select p.*
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
taxonomy_values as (
  select 'cuisine'::text as entity_type, trim(v) as canonical_name
  from eligible cross join lateral unnest(coalesce(cuisines, '{}'::text[])) v
  union all
  select 'food', trim(v)
  from eligible cross join lateral unnest(coalesce(foods, '{}'::text[])) v
  union all
  select 'meal_period', trim(v)
  from eligible cross join lateral unnest(coalesce(meal_periods, '{}'::text[])) v
  union all
  select 'feature', trim(v)
  from eligible cross join lateral unnest(coalesce(features, '{}'::text[])) v
  union all
  select 'audience', trim(v)
  from eligible cross join lateral unnest(coalesce(audiences, '{}'::text[])) v
  union all
  select 'occasion', trim(v)
  from eligible cross join lateral unnest(coalesce(occasions, '{}'::text[])) v
  union all
  select 'vibe', trim(v)
  from eligible cross join lateral unnest(coalesce(vibes, '{}'::text[])) v
  union all
  select 'restaurant_category', trim(v)
  from eligible cross join lateral unnest(coalesce(restaurant_categories, '{}'::text[])) v
  union all
  select 'activity_type', trim(v)
  from eligible cross join lateral unnest(coalesce(activity_categories, '{}'::text[])) v
  union all
  select 'nightlife_type', trim(v)
  from eligible cross join lateral unnest(coalesce(nightlife_categories, '{}'::text[])) v
),
deduped as (
  select
    entity_type,
    min(canonical_name) as canonical_name,
    lower(trim(regexp_replace(trim(canonical_name), '[^[:alnum:]]+', '-', 'g'))) as normalized_key
  from taxonomy_values
  where nullif(trim(canonical_name), '') is not null
  group by entity_type, lower(trim(regexp_replace(trim(canonical_name), '[^[:alnum:]]+', '-', 'g')))
)
insert into public.knowledge_entities (
  entity_type,
  canonical_key,
  canonical_name,
  attributes,
  confidence,
  source,
  source_updated_at,
  updated_at
)
select
  entity_type,
  entity_type || ':' || normalized_key,
  canonical_name,
  '{}'::jsonb,
  1,
  'location_search_profiles',
  now(),
  now()
from deduped
where normalized_key <> ''
on conflict (entity_type, canonical_key) do update set
  canonical_name = excluded.canonical_name,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

with eligible as (
  select p.*, l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
geo_values as (
  select 'market'::text as entity_type, trim(market) as canonical_name from eligible
  union all
  select 'city', trim(city) from eligible
  union all
  select 'neighborhood', trim(neighborhood) from eligible
  union all
  select 'borough', trim(borough) from eligible
  union all
  select 'zip_code', trim(zip_code) from eligible
),
deduped as (
  select
    entity_type,
    min(canonical_name) as canonical_name,
    lower(trim(regexp_replace(trim(canonical_name), '[^[:alnum:]]+', '-', 'g'))) as normalized_key
  from geo_values
  where nullif(trim(canonical_name), '') is not null
  group by entity_type, lower(trim(regexp_replace(trim(canonical_name), '[^[:alnum:]]+', '-', 'g')))
)
insert into public.knowledge_entities (
  entity_type,
  canonical_key,
  canonical_name,
  attributes,
  confidence,
  source,
  source_updated_at,
  updated_at
)
select
  entity_type,
  entity_type || ':' || normalized_key,
  canonical_name,
  '{}'::jsonb,
  1,
  'location_search_profiles',
  now(),
  now()
from deduped
where normalized_key <> ''
on conflict (entity_type, canonical_key) do update set
  canonical_name = excluded.canonical_name,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

-- Canonical aliases for taxonomy and geography entities.
insert into public.knowledge_entity_aliases (
  entity_id,
  alias,
  normalized_alias,
  source,
  confidence
)
select
  e.id,
  e.canonical_name,
  lower(trim(regexp_replace(trim(e.canonical_name), '[^[:alnum:]]+', ' ', 'g'))),
  e.source,
  1
from public.knowledge_entities e
where e.entity_type in (
  'cuisine','food','meal_period','feature','audience','occasion','vibe',
  'restaurant_category','activity_type','nightlife_type',
  'market','city','neighborhood','borough','zip_code'
)
  and nullif(trim(e.canonical_name), '') is not null
on conflict (entity_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  confidence = excluded.confidence;

-- Enrich NYC neighborhood entities with the authoritative alias table.
with neighborhood_match as (
  select
    e.id as entity_id,
    a.alias,
    a.normalized_alias
  from public.nyc_neighborhood_aliases a
  join public.nyc_neighborhoods n on n.nta_code = a.nta_code
  join public.knowledge_entities e
    on e.entity_type = 'neighborhood'
   and e.canonical_key = 'neighborhood:' ||
       lower(trim(regexp_replace(trim(n.name), '[^[:alnum:]]+', '-', 'g')))
)
insert into public.knowledge_entity_aliases (
  entity_id,
  alias,
  normalized_alias,
  source,
  confidence
)
select
  entity_id,
  alias,
  coalesce(nullif(trim(normalized_alias), ''),
    lower(trim(regexp_replace(trim(alias), '[^[:alnum:]]+', ' ', 'g')))),
  'nyc_neighborhood_aliases',
  1
from neighborhood_match
where nullif(trim(alias), '') is not null
on conflict (entity_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  confidence = excluded.confidence;

-- Attach the entire current search profile as evidence-rich entity state.
with eligible as (
  select p.*
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
)
insert into public.knowledge_entity_features (
  entity_id,
  feature_key,
  feature_value,
  source,
  confidence,
  freshness,
  verified_at,
  updated_at
)
select
  e.id,
  'search_profile',
  jsonb_strip_nulls(jsonb_build_object(
    'primaryDomain', p.primary_domain,
    'supportedDomains', p.supported_domains,
    'restaurantCategories', p.restaurant_categories,
    'cuisines', p.cuisines,
    'foods', p.foods,
    'activityCategories', p.activity_categories,
    'nightlifeCategories', p.nightlife_categories,
    'mealPeriods', p.meal_periods,
    'features', p.features,
    'audiences', p.audiences,
    'occasions', p.occasions,
    'vibes', p.vibes,
    'canonicalTerms', p.canonical_terms,
    'exclusions', p.exclusions,
    'searchText', p.search_text,
    'latitude', p.latitude,
    'longitude', p.longitude,
    'market', p.market,
    'city', p.city,
    'neighborhood', p.neighborhood,
    'borough', p.borough,
    'county', p.county,
    'state', p.state,
    'classificationSources', p.classification_sources,
    'evidence', p.evidence,
    'manualOverrides', p.manual_overrides,
    'needsReview', p.needs_review,
    'reviewReasons', p.review_reasons,
    'profileVersion', p.profile_version,
    'profileHash', p.profile_hash,
    'taxonomyVersion', p.taxonomy_version,
    'verificationSource', p.verification_source,
    'verificationNote', p.verification_note
  )),
  'location_search_profiles',
  greatest(0, least(1, coalesce(p.confidence, 0.75))),
  coalesce(p.updated_at, p.generated_at),
  p.verified_at,
  now()
from eligible p
join public.knowledge_entities e
  on e.entity_type = 'location'
 and e.canonical_key = 'location:' || p.location_id::text
on conflict (entity_id, feature_key, source) do update set
  feature_value = excluded.feature_value,
  confidence = excluded.confidence,
  freshness = excluded.freshness,
  verified_at = excluded.verified_at,
  updated_at = now();

-- Location -> taxonomy edges.
with eligible as (
  select p.*
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
expanded as (
  select location_id, 'cuisine'::text entity_type, 'has_cuisine'::text predicate, trim(v) value
  from eligible cross join lateral unnest(coalesce(cuisines, '{}'::text[])) v
  union all
  select location_id, 'food', 'serves_food', trim(v)
  from eligible cross join lateral unnest(coalesce(foods, '{}'::text[])) v
  union all
  select location_id, 'meal_period', 'serves_meal_period', trim(v)
  from eligible cross join lateral unnest(coalesce(meal_periods, '{}'::text[])) v
  union all
  select location_id, 'feature', 'has_feature', trim(v)
  from eligible cross join lateral unnest(coalesce(features, '{}'::text[])) v
  union all
  select location_id, 'audience', 'suited_for_audience', trim(v)
  from eligible cross join lateral unnest(coalesce(audiences, '{}'::text[])) v
  union all
  select location_id, 'occasion', 'suited_for_occasion', trim(v)
  from eligible cross join lateral unnest(coalesce(occasions, '{}'::text[])) v
  union all
  select location_id, 'vibe', 'has_vibe', trim(v)
  from eligible cross join lateral unnest(coalesce(vibes, '{}'::text[])) v
  union all
  select location_id, 'restaurant_category', 'has_restaurant_category', trim(v)
  from eligible cross join lateral unnest(coalesce(restaurant_categories, '{}'::text[])) v
  union all
  select location_id, 'activity_type', 'has_activity_type', trim(v)
  from eligible cross join lateral unnest(coalesce(activity_categories, '{}'::text[])) v
  union all
  select location_id, 'nightlife_type', 'has_nightlife_type', trim(v)
  from eligible cross join lateral unnest(coalesce(nightlife_categories, '{}'::text[])) v
)
insert into public.knowledge_edges (
  subject_entity_id,
  predicate,
  object_entity_id,
  confidence,
  source,
  updated_at
)
select distinct
  location_entity.id,
  x.predicate,
  target.id,
  1,
  'location_search_profiles',
  now()
from expanded x
join public.knowledge_entities location_entity
  on location_entity.entity_type = 'location'
 and location_entity.canonical_key = 'location:' || x.location_id::text
join public.knowledge_entities target
  on target.entity_type = x.entity_type
 and target.canonical_key = x.entity_type || ':' ||
     lower(trim(regexp_replace(trim(x.value), '[^[:alnum:]]+', '-', 'g')))
where nullif(trim(x.value), '') is not null
on conflict (subject_entity_id, predicate, object_entity_id) do update set
  confidence = excluded.confidence,
  source = excluded.source,
  updated_at = now();

-- Location -> geography edges.
with eligible as (
  select p.*, l.zip_code
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
expanded as (
  select location_id, 'market'::text entity_type, trim(market) value from eligible
  union all
  select location_id, 'city', trim(city) from eligible
  union all
  select location_id, 'neighborhood', trim(neighborhood) from eligible
  union all
  select location_id, 'borough', trim(borough) from eligible
  union all
  select location_id, 'zip_code', trim(zip_code) from eligible
)
insert into public.knowledge_edges (
  subject_entity_id,
  predicate,
  object_entity_id,
  confidence,
  source,
  updated_at
)
select distinct
  location_entity.id,
  'located_in',
  target.id,
  1,
  'location_search_profiles',
  now()
from expanded x
join public.knowledge_entities location_entity
  on location_entity.entity_type = 'location'
 and location_entity.canonical_key = 'location:' || x.location_id::text
join public.knowledge_entities target
  on target.entity_type = x.entity_type
 and target.canonical_key = x.entity_type || ':' ||
     lower(trim(regexp_replace(trim(x.value), '[^[:alnum:]]+', '-', 'g')))
where nullif(trim(x.value), '') is not null
on conflict (subject_entity_id, predicate, object_entity_id) do update set
  confidence = excluded.confidence,
  source = excluded.source,
  updated_at = now();

-- Geography hierarchy: neighborhood -> borough -> city -> market.
with eligible as (
  select p.*
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where l.is_searchable is true
    and coalesce(l.is_hidden, false) is false
    and l.deleted_at is null
),
pairs as (
  select distinct 'neighborhood'::text subject_type, trim(neighborhood) subject_name,
                  'borough'::text object_type, trim(borough) object_name
  from eligible
  where nullif(trim(neighborhood), '') is not null and nullif(trim(borough), '') is not null
  union
  select distinct 'borough', trim(borough), 'city', trim(city)
  from eligible
  where nullif(trim(borough), '') is not null and nullif(trim(city), '') is not null
  union
  select distinct 'city', trim(city), 'market', trim(market)
  from eligible
  where nullif(trim(city), '') is not null and nullif(trim(market), '') is not null
)
insert into public.knowledge_edges (
  subject_entity_id,
  predicate,
  object_entity_id,
  confidence,
  source,
  updated_at
)
select
  subject.id,
  'located_in',
  object.id,
  1,
  'location_search_profiles',
  now()
from pairs p
join public.knowledge_entities subject
  on subject.entity_type = p.subject_type
 and subject.canonical_key = p.subject_type || ':' ||
     lower(trim(regexp_replace(trim(p.subject_name), '[^[:alnum:]]+', '-', 'g')))
join public.knowledge_entities object
  on object.entity_type = p.object_type
 and object.canonical_key = p.object_type || ':' ||
     lower(trim(regexp_replace(trim(p.object_name), '[^[:alnum:]]+', '-', 'g')))
on conflict (subject_entity_id, predicate, object_entity_id) do update set
  confidence = excluded.confidence,
  source = excluded.source,
  updated_at = now();

insert into public.knowledge_graph_versions (
  version,
  status,
  source_snapshot,
  entity_count,
  edge_count,
  completed_at,
  metadata
)
select
  'kg-v1-production-seed',
  'ready',
  jsonb_build_object(
    'source', 'location_search_profiles',
    'eligibleLocations', (
      select count(*)
      from public.location_search_profiles p
      join public.locations l on l.id = p.location_id
      where l.is_searchable is true
        and coalesce(l.is_hidden, false) is false
        and l.deleted_at is null
    ),
    'profileVersionMax', (select max(profile_version) from public.location_search_profiles),
    'taxonomyVersionMax', (select max(taxonomy_version) from public.location_search_profiles)
  ),
  (select count(*) from public.knowledge_entities),
  (select count(*) from public.knowledge_edges),
  now(),
  jsonb_build_object('phase', 'search-v3-phase3', 'primaryRegion', 'east')
on conflict (version) do update set
  status = excluded.status,
  source_snapshot = excluded.source_snapshot,
  entity_count = excluded.entity_count,
  edge_count = excluded.edge_count,
  completed_at = excluded.completed_at,
  metadata = excluded.metadata;

commit;
