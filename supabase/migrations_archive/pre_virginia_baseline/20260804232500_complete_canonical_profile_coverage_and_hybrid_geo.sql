begin;

create extension if not exists pg_trgm;

create index if not exists location_search_profiles_domain_terms_gin
  on public.location_search_profiles using gin (supported_domains, canonical_terms);
create index if not exists location_search_profiles_geo_admin_idx
  on public.location_search_profiles (state, county, borough, city, neighborhood, market);
create index if not exists location_search_profiles_coordinates_idx
  on public.location_search_profiles (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists location_search_profiles_search_tsv_gin
  on public.location_search_profiles using gin (search_tsv);

create or replace function public.enterprise_search_profile_locations(
  p_query text default '', p_domain text default null, p_categories text[] default null,
  p_market text default null, p_state text default null, p_county text default null,
  p_borough text default null, p_city text default null, p_neighborhood text default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_radius_miles double precision default null, p_limit integer default 60
)
returns setof public.locations
language sql stable security definer set search_path = public
as $$
  with ranked_ids as (
    select p.location_id,
      case when p_latitude is not null and p_longitude is not null and p.latitude is not null and p.longitude is not null then
        3958.7613 * 2 * asin(sqrt(least(1, greatest(0,
          power(sin(radians(p.latitude - p_latitude) / 2), 2)
          + cos(radians(p_latitude)) * cos(radians(p.latitude))
          * power(sin(radians(p.longitude - p_longitude) / 2), 2)
        )))) else null end as profile_distance_miles,
      (case when p_neighborhood is not null and lower(coalesce(p.neighborhood,'')) = lower(p_neighborhood) then 60 else 0 end
       + case when p_city is not null and lower(coalesce(p.city,'')) = lower(p_city) then 45 else 0 end
       + case when p_borough is not null and lower(coalesce(p.borough,'')) = lower(p_borough) then 35 else 0 end
       + case when p_county is not null and lower(coalesce(p.county,'')) = lower(p_county) then 30 else 0 end
       + case when p_market is not null and lower(coalesce(p.market,'')) = lower(p_market) then 15 else 0 end) as admin_geo_score,
      case when coalesce(trim(p_query),'') = '' then 0
        else ts_rank_cd(p.search_tsv, websearch_to_tsquery('simple', p_query)) end as term_rank,
      p.confidence as profile_confidence
    from public.location_search_profiles p
    join public.locations l on l.id = p.location_id
    where l.active = true and l.is_searchable = true
      and coalesce(l.is_hidden,false) = false and coalesce(l.is_low_level,false) = false
      and p.profile_version >= 4
      and (p_domain is null or p.primary_domain = p_domain or p.supported_domains @> array[p_domain]::text[])
      and (p_state is null or lower(coalesce(p.state,'')) = lower(p_state))
      and (
        coalesce(trim(p_query),'') = ''
        or p.search_tsv @@ websearch_to_tsquery('simple', p_query)
        or p.canonical_terms && coalesce(p_categories,'{}'::text[])
        or exists (select 1 from unnest(coalesce(p_categories,'{}'::text[])) t where p.search_document ilike '%' || t || '%')
      )
  ), eligible as (
    select * from ranked_ids r
    where (
      (p_latitude is not null and p_longitude is not null and p_radius_miles is not null
        and r.profile_distance_miles is not null and r.profile_distance_miles <= p_radius_miles)
      or r.admin_geo_score > 0
      or (p_latitude is null and p_longitude is null and p_market is null and p_county is null and p_borough is null and p_city is null and p_neighborhood is null)
    )
    order by
      case when r.profile_distance_miles is not null and r.profile_distance_miles <= coalesce(p_radius_miles,999) then 1 else 0 end desc,
      r.admin_geo_score desc, r.term_rank desc, r.profile_confidence desc, r.location_id
    limit least(greatest(coalesce(p_limit,60),1),250)
  )
  select l.*
  from eligible e
  join public.locations l on l.id = e.location_id
  order by
    case when e.profile_distance_miles is not null and e.profile_distance_miles <= coalesce(p_radius_miles,999) then 1 else 0 end desc,
    e.admin_geo_score desc, e.term_rank desc, e.profile_confidence desc, e.location_id;
$$;

select * from public.enqueue_full_search_profile_rebuild(3, 'taxonomy_v3_complete_profile_coverage');

create or replace view public.search_profile_domain_coverage
with (security_invoker = true)
as
select
  coalesce(primary_domain,'unknown') as primary_domain,
  count(*) as profile_count,
  count(*) filter (where profile_version >= 4 and taxonomy_version >= 3) as current_profile_count,
  count(*) filter (where coalesce(cardinality(canonical_terms),0) > 0) as profiles_with_terms,
  count(*) filter (where latitude is not null and longitude is not null) as profiles_with_coordinates,
  count(*) filter (where city is not null or borough is not null or county is not null or neighborhood is not null) as profiles_with_admin_geo
from public.location_search_profiles
group by coalesce(primary_domain,'unknown');

revoke all on public.search_profile_domain_coverage from anon, authenticated;
grant select on public.search_profile_domain_coverage to service_role;

commit;
