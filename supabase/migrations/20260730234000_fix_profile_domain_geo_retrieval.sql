-- Canonical profile retrieval: domain-safe matching, cross-domain eligibility without verification gating,
-- normalized geography, and lane-specific category evidence.
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
  with eligible as (
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
      end as computed_distance_miles
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
        or p.supported_domains @> array[p_domain]::text[]
      )
      and (
        p_domain is null
        or (p_domain = 'restaurant' and (
          p.primary_domain = 'restaurant'
          or coalesce(cardinality(p.restaurant_categories), 0) > 0
          or coalesce(cardinality(p.cuisines), 0) > 0
          or coalesce(cardinality(p.foods), 0) > 0
        ))
        or (p_domain = 'activity' and (
          p.primary_domain = 'activity'
          or coalesce(cardinality(p.activity_categories), 0) > 0
          or coalesce(cardinality(p.nightlife_categories), 0) > 0
        ))
      )
  )
  select e.l
  from eligible e
  where (
    case
      when p_latitude is not null and p_longitude is not null and p_radius_miles is not null
        then e.computed_distance_miles is null or e.computed_distance_miles <= p_radius_miles
      when nullif(trim(p_neighborhood), '') is not null
        then regexp_replace(lower(coalesce(e.neighborhood, '')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_neighborhood), '[^a-z0-9]+', '', 'g')
      when nullif(trim(p_borough), '') is not null
        then regexp_replace(lower(coalesce(e.borough, '')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_borough), '[^a-z0-9]+', '', 'g')
      when nullif(trim(p_city), '') is not null
        then regexp_replace(lower(coalesce(e.city, '')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_city), '[^a-z0-9]+', '', 'g')
      when nullif(trim(p_county), '') is not null
        then regexp_replace(lower(coalesce(e.county, '')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_county), '[^a-z0-9]+', '', 'g')
      when nullif(trim(p_market), '') is not null
        then regexp_replace(lower(coalesce(e.market, '')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(p_market), '[^a-z0-9]+', '', 'g')
      when nullif(trim(p_state), '') is not null
        then lower(coalesce(e.state, '')) = lower(p_state)
      else true
    end
  )
  and (
    coalesce(trim(p_query), '') = ''
    or case
      when p_domain = 'restaurant' then
        e.restaurant_categories && coalesce(p_categories, '{}'::text[])
        or e.cuisines && coalesce(p_categories, '{}'::text[])
        or e.foods && coalesce(p_categories, '{}'::text[])
        or e.canonical_terms && coalesce(p_categories, '{}'::text[])
        or e.features && coalesce(p_categories, '{}'::text[])
        or e.search_tsv @@ websearch_to_tsquery('simple', p_query)
      when p_domain = 'activity' then
        e.activity_categories && coalesce(p_categories, '{}'::text[])
        or e.nightlife_categories && coalesce(p_categories, '{}'::text[])
        or e.canonical_terms && coalesce(p_categories, '{}'::text[])
        or e.features && coalesce(p_categories, '{}'::text[])
        or e.search_tsv @@ websearch_to_tsquery('simple', p_query)
      else e.search_tsv @@ websearch_to_tsquery('simple', p_query)
        or e.canonical_terms && coalesce(p_categories, '{}'::text[])
    end
  )
  order by
    case when e.primary_domain = p_domain then 0 else 1 end,
    e.computed_distance_miles nulls last,
    e.confidence desc,
    e.updated_at desc,
    e.location_id
  limit least(greatest(coalesce(p_limit, 60), 1), 250);
$$;

grant execute on function public.enterprise_search_profile_locations(
  text, text, text[], text, text, text, text, text, text,
  double precision, double precision, double precision, integer
) to authenticated, service_role;
