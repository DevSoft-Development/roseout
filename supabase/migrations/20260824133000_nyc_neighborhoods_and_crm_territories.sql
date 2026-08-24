begin;

create extension if not exists postgis with schema extensions;
create extension if not exists http with schema extensions;

create table if not exists public.nyc_neighborhoods (
  nta_code text primary key,
  name text not null,
  abbreviation text,
  borough text not null,
  borough_code smallint,
  nta_type text,
  cdta_code text,
  cdta_name text,
  county_fips text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  centroid extensions.geometry(Point, 4326),
  source text not null default 'NYC DCP 2020 NTA',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nyc_neighborhoods_geom_gix on public.nyc_neighborhoods using gist (geom);
create index if not exists nyc_neighborhoods_name_trgm_idx on public.nyc_neighborhoods using gin (name gin_trgm_ops);
create index if not exists nyc_neighborhoods_borough_idx on public.nyc_neighborhoods (borough);

create table if not exists public.nyc_neighborhood_aliases (
  id bigint generated always as identity primary key,
  nta_code text not null references public.nyc_neighborhoods(nta_code) on delete cascade,
  alias text not null,
  normalized_alias text generated always as (lower(trim(alias))) stored,
  alias_type text not null default 'common',
  created_at timestamptz not null default now(),
  unique (nta_code, normalized_alias)
);
create index if not exists nyc_neighborhood_aliases_trgm_idx on public.nyc_neighborhood_aliases using gin (normalized_alias gin_trgm_ops);

alter table public.locations add column if not exists neighborhood_nta_code text;
alter table public.locations add column if not exists neighborhood_source text;
alter table public.locations add column if not exists neighborhood_resolved_at timestamptz;
create index if not exists locations_neighborhood_nta_idx on public.locations (neighborhood_nta_code);
create index if not exists locations_neighborhood_trgm_idx on public.locations using gin (neighborhood gin_trgm_ops);
create index if not exists locations_borough_neighborhood_idx on public.locations (borough, neighborhood);

create or replace function public.lookup_nyc_neighborhood(p_latitude double precision, p_longitude double precision)
returns table(nta_code text, neighborhood text, borough text)
language sql stable security invoker set search_path = public, extensions
as $$
  select n.nta_code, n.name, n.borough
  from public.nyc_neighborhoods n
  where p_latitude between 40.45 and 40.95
    and p_longitude between -74.30 and -73.65
    and extensions.st_covers(n.geom, extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326))
  order by case when n.nta_type = '0' then 0 else 1 end, n.nta_code
  limit 1;
$$;

create or replace function public.sync_location_neighborhood_from_coordinates()
returns trigger
language plpgsql security invoker set search_path = public, extensions
as $$
declare v record;
begin
  if new.latitude is null or new.longitude is null then return new; end if;
  if tg_op = 'INSERT'
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude
     or new.neighborhood is null
     or new.neighborhood_nta_code is null then
    select * into v from public.lookup_nyc_neighborhood(new.latitude::double precision, new.longitude::double precision) limit 1;
    if found then
      new.neighborhood := v.neighborhood;
      new.neighborhood_nta_code := v.nta_code;
      new.borough := v.borough;
      new.neighborhood_source := 'nyc_dcp_2020_nta_coordinates';
      new.neighborhood_resolved_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_locations_sync_neighborhood on public.locations;
create trigger trg_locations_sync_neighborhood
before insert or update of latitude, longitude, neighborhood on public.locations
for each row execute function public.sync_location_neighborhood_from_coordinates();

create table if not exists public.crm_territories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_user_id uuid,
  borough text,
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_territories_owner_idx on public.crm_territories(owner_user_id) where status='active';

create table if not exists public.crm_territory_neighborhoods (
  territory_id uuid not null references public.crm_territories(id) on delete cascade,
  nta_code text not null references public.nyc_neighborhoods(nta_code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (territory_id, nta_code)
);
create index if not exists crm_territory_neighborhoods_nta_idx on public.crm_territory_neighborhoods(nta_code);

create table if not exists public.crm_territory_members (
  territory_id uuid not null references public.crm_territories(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (territory_id, user_id)
);
create index if not exists crm_territory_members_user_idx on public.crm_territory_members(user_id);

create or replace view public.crm_location_territories as
select l.id as location_id, l.name as location_name, l.neighborhood, l.neighborhood_nta_code, l.borough,
       t.id as territory_id, t.name as territory_name, t.owner_user_id
from public.locations l
left join public.crm_territory_neighborhoods tn on tn.nta_code = l.neighborhood_nta_code
left join public.crm_territories t on t.id = tn.territory_id and t.status = 'active';

with response as (
  select content::jsonb as doc
  from extensions.http_get('https://data.cityofnewyork.us/api/v3/views/9nt8-h7nd/query.geojson?accessType=DOWNLOAD')
), features as (
  select jsonb_array_elements(doc->'features') as f from response
), parsed as (
  select
    f->'properties'->>'nta2020' as nta_code,
    f->'properties'->>'ntaname' as name,
    f->'properties'->>'ntaabbrev' as abbreviation,
    f->'properties'->>'boroname' as borough,
    nullif(f->'properties'->>'borocode','')::smallint as borough_code,
    f->'properties'->>'ntatype' as nta_type,
    f->'properties'->>'cdta2020' as cdta_code,
    f->'properties'->>'cdtaname' as cdta_name,
    f->'properties'->>'countyfips' as county_fips,
    extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326)::extensions.geometry(MultiPolygon,4326) as geom,
    nullif(f->'properties'->>':updated_at','')::timestamptz as source_updated_at
  from features
)
insert into public.nyc_neighborhoods
(nta_code,name,abbreviation,borough,borough_code,nta_type,cdta_code,cdta_name,county_fips,geom,centroid,source_updated_at,updated_at)
select nta_code,name,abbreviation,borough,borough_code,nta_type,cdta_code,cdta_name,county_fips,geom,
       extensions.st_pointonsurface(geom)::extensions.geometry(Point,4326),source_updated_at,now()
from parsed
on conflict (nta_code) do update set
  name=excluded.name, abbreviation=excluded.abbreviation, borough=excluded.borough, borough_code=excluded.borough_code,
  nta_type=excluded.nta_type, cdta_code=excluded.cdta_code, cdta_name=excluded.cdta_name, county_fips=excluded.county_fips,
  geom=excluded.geom, centroid=excluded.centroid, source_updated_at=excluded.source_updated_at, updated_at=now();

insert into public.nyc_neighborhood_aliases (nta_code, alias, alias_type)
select nta_code, name, 'official' from public.nyc_neighborhoods
on conflict (nta_code, normalized_alias) do nothing;

insert into public.nyc_neighborhood_aliases (nta_code, alias, alias_type)
select nta_code, abbreviation, 'official_abbreviation'
from public.nyc_neighborhoods
where abbreviation is not null and trim(abbreviation) <> ''
on conflict (nta_code, normalized_alias) do nothing;

with aliases as (
  select n.nta_code, trim(regexp_replace(part, '\s*\([^)]*\)\s*', '', 'g')) as alias
  from public.nyc_neighborhoods n
  cross join lateral regexp_split_to_table(n.name, '-') part
  where n.nta_type='0'
)
insert into public.nyc_neighborhood_aliases (nta_code, alias, alias_type)
select nta_code, alias, 'derived_common'
from aliases
where length(alias) >= 3
on conflict (nta_code, normalized_alias) do nothing;

with resolved as (
  select l.id, n.nta_code, n.neighborhood, n.borough
  from public.locations l
  cross join lateral public.lookup_nyc_neighborhood(l.latitude::double precision, l.longitude::double precision) n
  where l.latitude is not null and l.longitude is not null
)
update public.locations l
set neighborhood = r.neighborhood,
    neighborhood_nta_code = r.nta_code,
    borough = r.borough,
    neighborhood_source = 'nyc_dcp_2020_nta_coordinates',
    neighborhood_resolved_at = now()
from resolved r
where l.id = r.id
  and (l.neighborhood is distinct from r.neighborhood
       or l.neighborhood_nta_code is distinct from r.nta_code
       or l.borough is distinct from r.borough);

update public.location_search_profiles p
set neighborhood = l.neighborhood, borough = l.borough, updated_at = now()
from public.locations l
where l.id = p.location_id
  and (p.neighborhood is distinct from l.neighborhood or p.borough is distinct from l.borough);

insert into public.search_anchors (
  canonical_name, normalized_name, aliases, anchor_type, source_type,
  city, state, borough, neighborhood, county, market,
  latitude, longitude, default_radius_miles, max_radius_miles, radius_strategy,
  external_id, priority, confidence, is_active, is_searchable, review_status, metadata,
  last_synced_at, sync_status, source_updated_at
)
select
  n.name, lower(trim(n.name)),
  coalesce(x.aliases, array[n.name || ' NYC']),
  'neighborhood', 'system', 'New York', 'NY', n.borough, n.name,
  case n.borough when 'Manhattan' then 'New York' else n.borough end,
  'NYC_CORE', extensions.st_y(n.centroid), extensions.st_x(n.centroid),
  1.5, 4.0, 'dense_urban', 'nta:' || n.nta_code, 95, 1.0,
  true, true, 'approved',
  jsonb_build_object('nta_code', n.nta_code, 'source', 'NYC DCP 2020 NTA', 'coordinate_authority', true),
  now(), 'current', n.source_updated_at
from public.nyc_neighborhoods n
left join lateral (
  select array_agg(distinct na.alias order by na.alias) || array[n.name || ' NYC'] as aliases
  from public.nyc_neighborhood_aliases na
  where na.nta_code=n.nta_code
) x on true
where n.nta_type='0'
  and not exists (
    select 1 from public.search_anchors a
    where a.normalized_name=lower(trim(n.name))
      and coalesce(a.market,'')='NYC_CORE'
      and coalesce(a.city,'')='New York'
      and coalesce(a.state,'')='NY'
  );

commit;
