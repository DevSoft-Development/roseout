update public.locations
set
  public_location_url =
    'https://theouthaven.com/locations/' ||
    case
      when lower(coalesce(location_type, type, source_table, primary_category, '')) like '%activity%'
        or lower(coalesce(location_type, type, source_table, primary_category, '')) = 'activities'
      then 'activities'
      else 'restaurants'
    end ||
    '/' ||
    coalesce(slug, id::text),
  qr_code_data_url = null,
  qr_code_url = null
where public_location_url is null
   or public_location_url like '%roseout%'
   or public_location_url not like '%/locations/%/%';

update public.locations
set
  claim_url = replace(claim_url, 'https://roseout.com', 'https://theouthaven.com'),
  qr_link = replace(qr_link, 'https://roseout.com', 'https://theouthaven.com')
where claim_url like '%roseout%'
   or qr_link like '%roseout%';
