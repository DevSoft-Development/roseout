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
  select l.*
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
    and (p_market is null or lower(coalesce(p.market, '')) = lower(p_market))
    and (p_state is null or lower(coalesce(p.state, '')) = lower(p_state))
    and (p_county is null or lower(coalesce(p.county, '')) = lower(p_county))
    and (p_borough is null or lower(coalesce(p.borough, '')) = lower(p_borough))
    and (p_city is null or lower(coalesce(p.city, '')) = lower(p_city))
    and (p_neighborhood is null or lower(coalesce(p.neighborhood, '')) = lower(p_neighborhood))
    and (
      coalesce(trim(p_query), '') = ''
      or p.search_tsv @@ websearch_to_tsquery('simple', p_query)
      or p.canonical_terms && coalesce(p_categories, '{}'::text[])
      or p.activity_categories && coalesce(p_categories, '{}'::text[])
      or p.nightlife_categories && coalesce(p_categories, '{}'::text[])
    )
    and (
      p_latitude is null or p_longitude is null or p_radius_miles is null
      or p.latitude is null or p.longitude is null
      or 3958.7613 * 2 * asin(sqrt(
        least(1, greatest(0,
          power(sin(radians(p.latitude - p_latitude) / 2), 2)
          + cos(radians(p_latitude)) * cos(radians(p.latitude))
          * power(sin(radians(p.longitude - p_longitude) / 2), 2)
        ))
      )) <= p_radius_miles
    )
  order by
    case when p.primary_domain = p_domain then 0 else 1 end,
    case when coalesce(trim(p_query), '') = '' then 0 else ts_rank_cd(p.search_tsv, websearch_to_tsquery('simple', p_query)) end desc,
    p.confidence desc,
    p.updated_at desc,
    p.location_id
  limit least(greatest(coalesce(p_limit, 60), 1), 250);
$$;

revoke all on function public.enterprise_search_profile_locations(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) from public;
grant execute on function public.enterprise_search_profile_locations(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) to anon, authenticated, service_role;

comment on function public.enterprise_search_profile_locations(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) is
  'Canonical profile retrieval with strict primary-domain authority and verified dual-domain qualification.';
