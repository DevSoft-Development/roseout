-- Fix canonical profile retrieval by applying one authoritative geography scope
-- instead of requiring every populated text field to match simultaneously.

create or replace function public.enterprise_search_profile_locations(
  p_query text default '',
  p_domain text default null,
  p_categories text[] default null,
  p_market text default null,
  p_state text default null,
  p_county text default null,
  p_borough text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_miles double precision default null,
  p_limit integer default 60
)
returns setof public.locations
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select
      p.*,
      l.*,
      case
        when p_latitude is not null and p_longitude is not null and p_radius_miles is not null
          and p.latitude is not null and p.longitude is not null
        then 3958.7613 * 2 * asin(sqrt(least(1, greatest(0,
          power(sin(radians(p.latitude - p_latitude) / 2), 2)
          + cos(radians(p_latitude)) * cos(radians(p.latitude))
          * power(sin(radians(p.longitude - p_longitude) / 2), 2)
        ))))
        else null
      end as profile_distance_miles
    from public.location_search_profiles p
    join public.locations l on l.id = p.location_id
    where l.active = true
      and l.is_searchable = true
      and l.is_hidden = false
      and l.is_low_level = false
      and p.profile_version >= 3
      and (
        p_domain is null
        or p.primary_domain = p_domain
        or (
          coalesce(l.is_verified, false) = true
          and p.supported_domains @> array[p_domain]::text[]
          and (
            p_domain = 'restaurant'
            or coalesce(cardinality(p.activity_categories), 0) > 0
            or coalesce(cardinality(p.nightlife_categories), 0) > 0
          )
        )
      )
  )
  select s.*
  from scoped s
  where (
    -- Coordinates are authoritative when all coordinate arguments are present.
    (p_latitude is not null and p_longitude is not null and p_radius_miles is not null
      and (s.profile_distance_miles is null or s.profile_distance_miles <= p_radius_miles))
    or
    -- Otherwise use exactly one most-specific text geography scope.
    (not (p_latitude is not null and p_longitude is not null and p_radius_miles is not null)
      and case
        when nullif(trim(p_neighborhood), '') is not null
          then lower(coalesce(s.neighborhood, '')) = lower(p_neighborhood)
        when nullif(trim(p_borough), '') is not null
          then lower(coalesce(s.borough, '')) = lower(p_borough)
        when nullif(trim(p_city), '') is not null
          then lower(coalesce(s.city, '')) = lower(p_city)
        when nullif(trim(p_county), '') is not null
          then lower(coalesce(s.county, '')) = lower(p_county)
        when nullif(trim(p_market), '') is not null
          then lower(coalesce(s.market, '')) = lower(p_market)
        when nullif(trim(p_state), '') is not null
          then lower(coalesce(s.state, '')) = lower(p_state)
        else true
      end)
  )
  and (
    coalesce(trim(p_query), '') = ''
    or s.search_tsv @@ websearch_to_tsquery('simple', p_query)
    or s.canonical_terms && coalesce(p_categories, '{}'::text[])
    or s.restaurant_categories && coalesce(p_categories, '{}'::text[])
    or s.cuisines && coalesce(p_categories, '{}'::text[])
    or s.foods && coalesce(p_categories, '{}'::text[])
    or s.activity_categories && coalesce(p_categories, '{}'::text[])
    or s.nightlife_categories && coalesce(p_categories, '{}'::text[])
    or s.features && coalesce(p_categories, '{}'::text[])
  )
  order by
    case when s.primary_domain = p_domain then 0 else 1 end,
    case when s.profile_distance_miles is null then 1 else 0 end,
    s.profile_distance_miles nulls last,
    case when coalesce(trim(p_query), '') = '' then 0
      else ts_rank_cd(s.search_tsv, websearch_to_tsquery('simple', p_query)) end desc,
    s.confidence desc,
    s.updated_at desc,
    s.location_id
  limit least(greatest(coalesce(p_limit, 60), 1), 250);
$$;

create or replace function public.enterprise_search_profile_location_diagnostics(
  p_query text default '',
  p_domain text default null,
  p_categories text[] default null,
  p_market text default null,
  p_state text default null,
  p_county text default null,
  p_borough text default null,
  p_city text default null,
  p_neighborhood text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_miles double precision default null,
  p_limit integer default 60
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.*, l.is_verified,
      case when p_latitude is not null and p_longitude is not null and p_radius_miles is not null
        and p.latitude is not null and p.longitude is not null
      then 3958.7613 * 2 * asin(sqrt(least(1, greatest(0,
        power(sin(radians(p.latitude - p_latitude) / 2), 2)
        + cos(radians(p_latitude)) * cos(radians(p.latitude))
        * power(sin(radians(p.longitude - p_longitude) / 2), 2)
      )))) else null end as distance_miles
    from public.location_search_profiles p
    join public.locations l on l.id = p.location_id
    where l.active = true and l.is_searchable = true and l.is_hidden = false and l.is_low_level = false and p.profile_version >= 3
  ), domain_ok as (
    select * from base where p_domain is null or primary_domain = p_domain or (
      coalesce(is_verified, false) and supported_domains @> array[p_domain]::text[] and
      (p_domain = 'restaurant' or cardinality(activity_categories) > 0 or cardinality(nightlife_categories) > 0)
    )
  ), geo_ok as (
    select * from domain_ok where
      case
        when p_latitude is not null and p_longitude is not null and p_radius_miles is not null
          then distance_miles is null or distance_miles <= p_radius_miles
        when nullif(trim(p_neighborhood), '') is not null then lower(coalesce(neighborhood, '')) = lower(p_neighborhood)
        when nullif(trim(p_borough), '') is not null then lower(coalesce(borough, '')) = lower(p_borough)
        when nullif(trim(p_city), '') is not null then lower(coalesce(city, '')) = lower(p_city)
        when nullif(trim(p_county), '') is not null then lower(coalesce(county, '')) = lower(p_county)
        when nullif(trim(p_market), '') is not null then lower(coalesce(market, '')) = lower(p_market)
        when nullif(trim(p_state), '') is not null then lower(coalesce(state, '')) = lower(p_state)
        else true
      end
  ), terms_ok as (
    select * from geo_ok where coalesce(trim(p_query), '') = ''
      or search_tsv @@ websearch_to_tsquery('simple', p_query)
      or canonical_terms && coalesce(p_categories, '{}'::text[])
      or restaurant_categories && coalesce(p_categories, '{}'::text[])
      or cuisines && coalesce(p_categories, '{}'::text[])
      or foods && coalesce(p_categories, '{}'::text[])
      or activity_categories && coalesce(p_categories, '{}'::text[])
      or nightlife_categories && coalesce(p_categories, '{}'::text[])
      or features && coalesce(p_categories, '{}'::text[])
  )
  select jsonb_build_object(
    'eligibleBeforeFilters', (select count(*) from base),
    'eligibleAfterDomain', (select count(*) from domain_ok),
    'rejectedByDomain', (select count(*) from base) - (select count(*) from domain_ok),
    'eligibleAfterGeography', (select count(*) from geo_ok),
    'rejectedByGeography', (select count(*) from domain_ok) - (select count(*) from geo_ok),
    'eligibleAfterTerms', (select count(*) from terms_ok),
    'rejectedByTerms', (select count(*) from geo_ok) - (select count(*) from terms_ok),
    'returned', least((select count(*) from terms_ok), least(greatest(coalesce(p_limit, 60), 1), 250)),
    'geographyStrategy', case
      when p_latitude is not null and p_longitude is not null and p_radius_miles is not null then 'coordinates'
      when nullif(trim(p_neighborhood), '') is not null then 'neighborhood'
      when nullif(trim(p_borough), '') is not null then 'borough'
      when nullif(trim(p_city), '') is not null then 'city'
      when nullif(trim(p_county), '') is not null then 'county'
      when nullif(trim(p_market), '') is not null then 'market'
      when nullif(trim(p_state), '') is not null then 'state'
      else 'none'
    end
  );
$$;

grant execute on function public.enterprise_search_profile_locations(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) to authenticated, service_role;
grant execute on function public.enterprise_search_profile_location_diagnostics(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) to service_role;
