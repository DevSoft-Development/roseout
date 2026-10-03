begin;

-- Search V3 Phase 4: ingest approved search anchors into the Knowledge Graph.
-- Execute on East primary only; West receives rows through logical replication.

with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
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
  linked_location_id,
  jsonb_strip_nulls(jsonb_build_object(
    'anchorId', id,
    'anchorType', anchor_type,
    'sourceType', source_type,
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
    'syncStatus', sync_status,
    'reviewStatus', review_status,
    'googlePlaceId', google_place_id
  )),
  greatest(0, least(1, coalesce(confidence, 1))),
  'search_anchors',
  coalesce(source_updated_at, last_synced_at, updated_at),
  now()
from approved
where nullif(trim(canonical_name), '') is not null
on conflict (entity_type, canonical_key) do update set
  canonical_name = excluded.canonical_name,
  location_id = excluded.location_id,
  attributes = excluded.attributes,
  confidence = excluded.confidence,
  source = excluded.source,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();

with approved as (
  select *
  from public.search_anchors
  where is_active is true
    and is_searchable is true
    and review_status = 'approved'
),
alias_values as (
  select id, anchor_type, canonical_name as alias
  from approved
  where nullif(trim(canonical_name), '') is not null
  union all
  select a.id, a.anchor_type, x.alias
  from approved a
  cross join lateral unnest(coalesce(a.aliases, '{}'::text[])) x(alias)
  where nullif(trim(x.alias), '') is not null
),
normalized as (
  select
    id,
    anchor_type,
    min(trim(alias)) as alias,
    lower(trim(regexp_replace(trim(alias), '[^[:alnum:]]+', ' ', 'g'))) as normalized_alias
  from alias_values
  group by
    id,
    anchor_type,
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
  'search_anchors',
  1
from normalized n
join public.knowledge_entities e
  on e.entity_type = coalesce(nullif(trim(n.anchor_type), ''), 'landmark')
 and e.canonical_key = 'search_anchor:' || n.id::text
where n.normalized_alias <> ''
on conflict (entity_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  confidence = excluded.confidence;

-- Preserve a small set of stable shorthand aliases used by existing search traffic.
with generated(anchor_name, alias) as (
  values
    ('Madison Square Garden', 'MSG'),
    ('Museum of Modern Art', 'MoMA'),
    ('UBS Arena', 'UBS'),
    ('Citi Field', 'CitiField'),
    ('LaGuardia Airport', 'LGA'),
    ('John F Kennedy International Airport', 'JFK')
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
  g.alias,
  lower(trim(regexp_replace(trim(g.alias), '[^[:alnum:]]+', ' ', 'g'))),
  'search_v3_generated_alias',
  1
from generated g
join public.knowledge_entities e
  on lower(e.canonical_name) = lower(g.anchor_name)
 and e.source = 'search_anchors'
on conflict (entity_id, normalized_alias) do update set
  alias = excluded.alias,
  source = excluded.source,
  confidence = excluded.confidence;

-- Link registry anchors to their canonical location entity when available.
insert into public.knowledge_edges (
  subject_entity_id,
  predicate,
  object_entity_id,
  confidence,
  source,
  updated_at
)
select
  anchor_entity.id,
  'represents_location',
  location_entity.id,
  1,
  'search_anchors',
  now()
from public.search_anchors a
join public.knowledge_entities anchor_entity
  on anchor_entity.canonical_key = 'search_anchor:' || a.id::text
 and anchor_entity.source = 'search_anchors'
join public.knowledge_entities location_entity
  on location_entity.entity_type = 'location'
 and location_entity.location_id = a.linked_location_id
where a.is_active is true
  and a.is_searchable is true
  and a.review_status = 'approved'
  and a.linked_location_id is not null
on conflict (subject_entity_id, predicate, object_entity_id) do update set
  confidence = excluded.confidence,
  source = excluded.source,
  updated_at = now();

-- Attach anchor entities to existing geography entities.
with geo as (
  select id, anchor_type, 'market'::text as entity_type, trim(market) as value
  from public.search_anchors
  where is_active is true and is_searchable is true and review_status='approved'
  union all
  select id, anchor_type, 'city', trim(city)
  from public.search_anchors
  where is_active is true and is_searchable is true and review_status='approved'
  union all
  select id, anchor_type, 'neighborhood', trim(neighborhood)
  from public.search_anchors
  where is_active is true and is_searchable is true and review_status='approved'
  union all
  select id, anchor_type, 'borough', trim(borough)
  from public.search_anchors
  where is_active is true and is_searchable is true and review_status='approved'
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
  anchor_entity.id,
  'located_in',
  geo_entity.id,
  1,
  'search_anchors',
  now()
from geo g
join public.knowledge_entities anchor_entity
  on anchor_entity.canonical_key = 'search_anchor:' || g.id::text
 and anchor_entity.entity_type = coalesce(nullif(trim(g.anchor_type), ''), 'landmark')
join public.knowledge_entities geo_entity
  on geo_entity.entity_type = g.entity_type
 and geo_entity.canonical_key =
     g.entity_type || ':' ||
     lower(trim(regexp_replace(trim(g.value), '[^[:alnum:]]+', '-', 'g')))
where nullif(trim(g.value), '') is not null
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
  'kg-v1-anchor-registry',
  'ready',
  jsonb_build_object(
    'source', 'search_anchors',
    'approvedSearchableAnchors', (
      select count(*)
      from public.search_anchors
      where is_active is true
        and is_searchable is true
        and review_status = 'approved'
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
