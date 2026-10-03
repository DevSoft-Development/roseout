begin;

-- Search V3 Phase 4 anchor/entity ingestion.
-- Execute on East primary only; West receives rows through logical replication.
-- Linked approved anchors enrich existing location graph entities.
-- Unlinked anchors (or linked anchors whose location is absent from the graph)
-- become standalone graph entities.

with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
),
mapped as (
  select
    a.*,
    le.id as location_entity_id
  from approved a
  left join public.knowledge_entities le
    on le.entity_type = 'location'
   and le.canonical_key = 'location:' || a.linked_location_id::text
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
  coalesce(nullif(trim(anchor_type), ''), 'landmark'),
  'search_anchor:' || id::text,
  canonical_name,
  null,
  jsonb_strip_nulls(jsonb_build_object(
    'anchorId', id,
    'anchorType', anchor_type,
    'sourceType', source_type,
    'linkedLocationId', linked_location_id,
    'latitude', latitude,
    'longitude', longitude,
    'city', city,
    'state', state,
    'borough', borough,
    'neighborhood', neighborhood,
    'county', county,
    'market', market,
    'defaultRadiusMiles', default_radius_miles,
    'maxRadiusMiles', max_radius_miles,
    'radiusStrategy', radius_strategy,
    'googlePlaceId', google_place_id,
    'syncStatus', sync_status
  )),
  greatest(0, least(1, coalesce(confidence, 1))),
  'search_anchors',
  source_updated_at,
  now()
from mapped
where location_entity_id is null
on conflict (entity_type, canonical_key) do update set
  canonical_name = excluded.canonical_name,
  attributes = excluded.attributes,
  confidence = excluded.confidence,
  source = excluded.source,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

-- Enrich existing location entities with anchor metadata when linked.
with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
)
update public.knowledge_entities e
set
  attributes = coalesce(e.attributes, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'anchorId', a.id,
    'anchorType', a.anchor_type,
    'anchorSourceType', a.source_type,
    'latitude', coalesce((e.attributes->>'latitude')::numeric, a.latitude),
    'longitude', coalesce((e.attributes->>'longitude')::numeric, a.longitude),
    'defaultRadiusMiles', a.default_radius_miles,
    'maxRadiusMiles', a.max_radius_miles,
    'radiusStrategy', a.radius_strategy,
    'anchorSyncStatus', a.sync_status
  )),
  updated_at = now()
from approved a
where a.linked_location_id is not null
  and e.entity_type = 'location'
  and e.canonical_key = 'location:' || a.linked_location_id::text;

-- Create canonical + curated aliases for both linked and standalone targets.
with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
),
targets as (
  select
    a.*,
    coalesce(
      le.id,
      se.id
    ) as entity_id
  from approved a
  left join public.knowledge_entities le
    on le.entity_type = 'location'
   and le.canonical_key = 'location:' || a.linked_location_id::text
  left join public.knowledge_entities se
    on se.canonical_key = 'search_anchor:' || a.id::text
),
raw_aliases as (
  select entity_id, canonical_name as alias, 1.0::numeric as confidence
  from targets
  where entity_id is not null and nullif(trim(canonical_name), '') is not null
  union all
  select t.entity_id, trim(v) as alias, 1.0::numeric
  from targets t
  cross join lateral unnest(coalesce(t.aliases, '{}'::text[])) v
  where t.entity_id is not null and nullif(trim(v), '') is not null
),
deduped as (
  select
    entity_id,
    min(alias) as alias,
    lower(trim(regexp_replace(trim(alias), '[^[:alnum:]]+', ' ', 'g'))) as normalized_alias,
    max(confidence) as confidence
  from raw_aliases
  group by
    entity_id,
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
  entity_id,
  alias,
  normalized_alias,
  'search_anchors',
  confidence
from deduped
where normalized_alias <> ''
on conflict (entity_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  confidence = excluded.confidence;

-- Store the full anchor record as a feature snapshot.
with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
),
targets as (
  select
    a.*,
    coalesce(le.id, se.id) as entity_id
  from approved a
  left join public.knowledge_entities le
    on le.entity_type = 'location'
   and le.canonical_key = 'location:' || a.linked_location_id::text
  left join public.knowledge_entities se
    on se.canonical_key = 'search_anchor:' || a.id::text
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
  entity_id,
  'search_anchor',
  jsonb_strip_nulls(jsonb_build_object(
    'anchorId', id,
    'canonicalName', canonical_name,
    'normalizedName', normalized_name,
    'aliases', aliases,
    'anchorType', anchor_type,
    'sourceType', source_type,
    'linkedLocationId', linked_location_id,
    'latitude', latitude,
    'longitude', longitude,
    'city', city,
    'state', state,
    'borough', borough,
    'neighborhood', neighborhood,
    'county', county,
    'market', market,
    'defaultRadiusMiles', default_radius_miles,
    'maxRadiusMiles', max_radius_miles,
    'radiusStrategy', radius_strategy,
    'googlePlaceId', google_place_id,
    'reviewStatus', review_status,
    'syncStatus', sync_status,
    'metadata', metadata
  )),
  'search_anchors',
  greatest(0, least(1, coalesce(confidence, 1))),
  coalesce(last_synced_at, source_updated_at, updated_at),
  case when review_status = 'approved' then updated_at else null end,
  now()
from targets
where entity_id is not null
on conflict (entity_id, feature_key, source) do update set
  feature_value = excluded.feature_value,
  confidence = excluded.confidence,
  freshness = excluded.freshness,
  verified_at = excluded.verified_at,
  updated_at = now();

-- Anchor/entity -> graph geography relationships.
with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
),
targets as (
  select
    a.*,
    coalesce(le.id, se.id) as entity_id
  from approved a
  left join public.knowledge_entities le
    on le.entity_type = 'location'
   and le.canonical_key = 'location:' || a.linked_location_id::text
  left join public.knowledge_entities se
    on se.canonical_key = 'search_anchor:' || a.id::text
),
geo as (
  select entity_id, 'market'::text as entity_type, trim(market) as value from targets
  union all
  select entity_id, 'city', trim(city) from targets
  union all
  select entity_id, 'borough', trim(borough) from targets
  union all
  select entity_id, 'neighborhood', trim(neighborhood) from targets
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
  g.entity_id,
  'located_in',
  target.id,
  1,
  'search_anchors',
  now()
from geo g
join public.knowledge_entities target
  on target.entity_type = g.entity_type
 and target.canonical_key = g.entity_type || ':' ||
     lower(trim(regexp_replace(trim(g.value), '[^[:alnum:]]+', '-', 'g')))
where g.entity_id is not null
  and nullif(trim(g.value), '') is not null
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
  'kg-v1-anchor-ingestion',
  'ready',
  jsonb_build_object(
    'source', 'search_anchors',
    'approvedSearchable', (
      select count(*)
      from public.search_anchors
      where is_active is true
        and is_searchable is true
        and review_status = 'approved'
    ),
    'linkedAnchors', (
      select count(*)
      from public.search_anchors
      where is_active is true
        and is_searchable is true
        and review_status = 'approved'
        and linked_location_id is not null
    ),
    'unlinkedAnchors', (
      select count(*)
      from public.search_anchors
      where is_active is true
        and is_searchable is true
        and review_status = 'approved'
        and linked_location_id is null
    )
  ),
  (select count(*) from public.knowledge_entities),
  (select count(*) from public.knowledge_edges),
  now(),
  jsonb_build_object('phase', 'search-v3-phase4', 'primaryRegion', 'east')
on conflict (version) do update set
  status = excluded.status,
  source_snapshot = excluded.source_snapshot,
  entity_count = excluded.entity_count,
  edge_count = excluded.edge_count,
  completed_at = excluded.completed_at,
  metadata = excluded.metadata;

commit;
