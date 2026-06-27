select
  id,
  name,
  address,
  city,
  state,
  zip_code,
  borough,
  neighborhood,
  market,
  case
    when address ilike '%' || city || '%' and address ilike '%' || zip_code || '%' then 'address_contains_city_state_zip'
    when coalesce(zip_code, zip, postal_code) = '11101' and coalesce(borough, '') <> 'Queens' then 'lic_wrong_borough'
    when coalesce(zip_code, zip, postal_code) = '11101' and coalesce(market, '') <> 'NYC_CORE' then 'lic_wrong_market'
    when coalesce(city, '') = 'New York' and coalesce(borough, '') = '' then 'new_york_city_missing_borough'
    else 'review'
  end as issue
from public.locations
where
  (
    address ilike '%' || city || '%'
    and address ilike '%' || coalesce(zip_code, zip, postal_code, '') || '%'
    and coalesce(zip_code, zip, postal_code, '') <> ''
  )
  or (
    coalesce(zip_code, zip, postal_code) = '11101'
    and (
      coalesce(borough, '') <> 'Queens'
      or coalesce(market, '') <> 'NYC_CORE'
    )
  )
  or (
    coalesce(city, '') = 'New York'
    and coalesce(borough, '') = ''
  )
order by issue, name
limit 500;
