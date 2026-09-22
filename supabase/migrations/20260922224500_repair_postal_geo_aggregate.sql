-- Rebuild postal cache from aggregate inventory evidence instead of a single representative row.

with aggregated as (
  select
    public.normalize_zip5(coalesce(zip_code, postal_code)) as zip_code,
    mode() within group (order by nullif(trim(city), '')) as city,
    mode() within group (order by nullif(trim(neighborhood), '')) as neighborhood,
    mode() within group (order by nullif(trim(borough), '')) as borough,
    mode() within group (order by nullif(trim(state), '')) as state,
    mode() within group (order by nullif(trim(market), '')) as market,
    avg(latitude::double precision) filter (where latitude is not null) as latitude,
    avg(longitude::double precision) filter (where longitude is not null) as longitude,
    jsonb_agg(distinct nullif(trim(neighborhood), '')) filter (where nullif(trim(neighborhood), '') is not null) as neighborhood_candidates,
    count(*) as inventory_count
  from public.locations
  where public.normalize_zip5(coalesce(zip_code, postal_code)) is not null
  group by public.normalize_zip5(coalesce(zip_code, postal_code))
),
resolved as (
  select
    a.*,
    case
      when a.borough = 'Manhattan' then 'New York County'
      when a.borough = 'Brooklyn' then 'Kings County'
      when a.borough = 'Queens' then 'Queens County'
      when a.borough = 'Bronx' then 'Bronx County'
      when a.borough = 'Staten Island' then 'Richmond County'
      when a.city = any(array[
        'Hempstead','North Hempstead','Oyster Bay','Garden City','Mineola','Westbury','New Hyde Park',
        'Great Neck','Manhasset','Port Washington','Roslyn','Glen Cove','Syosset','Hicksville','Levittown',
        'Bethpage','Plainview','Farmingdale','Massapequa','Massapequa Park','Freeport','Baldwin',
        'Rockville Centre','Lynbrook','Valley Stream','Elmont','Franklin Square','Uniondale','East Meadow',
        'Merrick','Bellmore','Wantagh','Seaford','Long Beach','Oceanside','Island Park'
      ]) then 'Nassau County'
      when a.city = any(array[
        'Huntington','Huntington Station','Melville','Dix Hills','Commack','Smithtown','Hauppauge',
        'Stony Brook','Port Jefferson','Setauket','Ronkonkoma','Lake Ronkonkoma','Patchogue','Medford',
        'Holbrook','Islip','East Islip','Bay Shore','Brentwood','Central Islip','Babylon','West Babylon',
        'Deer Park','Lindenhurst','Amityville','Copiague','Sayville','Bohemia','Riverhead','Southampton',
        'East Hampton','Montauk','Greenport'
      ]) then 'Suffolk County'
      when a.city = any(array['Hoboken','Jersey City','Weehawken','Union City','North Bergen','West New York','Secaucus','Bayonne']) then 'Hudson County'
      when a.city = any(array['Newark','Downtown Newark','Ironbound','Montclair','Bloomfield','Glen Ridge','West Orange','East Orange','South Orange','Maplewood','Livingston','Millburn','Short Hills']) then 'Essex County'
      when a.city = any(array['Elizabeth','Linden','Rahway','Union']) then 'Union County'
      when a.city = any(array['Clifton','Passaic','Paterson']) then 'Passaic County'
      when a.city = any(array['Hackensack','Teaneck','Fort Lee','Edgewater','Englewood','Ridgewood','Paramus','Bergenfield','Fair Lawn','Rutherford','East Rutherford','Lyndhurst']) then 'Bergen County'
      else null
    end as inferred_county
  from aggregated a
)
update public.geo_postal_areas g
set
  city = coalesce(r.city, g.city),
  primary_neighborhood = coalesce(r.neighborhood, r.city, g.primary_neighborhood),
  borough = coalesce(r.borough, g.borough),
  county = coalesce(r.inferred_county, g.county),
  state = coalesce(r.state, g.state),
  market = coalesce(
    r.market,
    case
      when r.borough is not null then 'NYC_CORE'
      when r.inferred_county in ('Nassau County','Suffolk County') then 'LONG_ISLAND'
      when r.inferred_county in ('Hudson County','Essex County','Union County','Passaic County','Bergen County') then 'NORTHERN_NJ'
      when r.state = 'CT' then 'CONNECTICUT'
      else null
    end,
    g.market
  ),
  latitude = coalesce(r.latitude, g.latitude),
  longitude = coalesce(r.longitude, g.longitude),
  neighborhood_candidates = coalesce(r.neighborhood_candidates, g.neighborhood_candidates),
  source = 'location_inventory_aggregate',
  confidence = case when r.inventory_count >= 10 then 0.9000 when r.inventory_count >= 3 then 0.8000 else 0.6500 end,
  is_supported_market = coalesce(
    r.market in ('NYC','NYC_CORE','LONG_ISLAND','NORTHERN_NJ','WESTCHESTER','CONNECTICUT'),
    g.is_supported_market
  ),
  updated_at = now()
from resolved r
where g.zip_code = r.zip_code;

-- Refresh derived consumer geography after cache correction.
update public.consumer_profiles
set home_zip_code = home_zip_code
where home_zip_code is not null;
