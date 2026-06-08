select
  'locations' as table_name,
  count(*) filter (
    where claim_url ilike '%roseout%'
       or qr_link ilike '%roseout%'
  ) as legacy_url_rows,
  count(*) filter (
    where claim_code is null
       or claim_url is null
       or claim_qr_url is null
       or qr_code_data_url is null
  ) as incomplete_qr_rows
from public.locations

union all

select
  'restaurants' as table_name,
  count(*) filter (
    where claim_url ilike '%roseout%'
       or qr_link ilike '%roseout%'
  ) as legacy_url_rows,
  count(*) filter (
    where claim_code is null
       or claim_url is null
       or claim_qr_url is null
       or qr_code_data_url is null
  ) as incomplete_qr_rows
from public.restaurants

union all

select
  'activities' as table_name,
  count(*) filter (
    where claim_url ilike '%roseout%'
       or qr_link ilike '%roseout%'
  ) as legacy_url_rows,
  count(*) filter (
    where claim_code is null
       or claim_url is null
       or claim_qr_url is null
       or qr_code_data_url is null
  ) as incomplete_qr_rows
from public.activities;
