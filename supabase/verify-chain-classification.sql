select
  'locations' as table_name,
  count(*) as total,
  count(*) filter (where chain_classified_at is not null) as classified,
  count(*) filter (where chain_classified_at is null) as unclassified,
  count(*) filter (where is_chain = true) as chains_found,
  count(*) filter (where is_chain = false) as independent_found
from public.locations

union all

select
  'location_import_staging' as table_name,
  count(*) as total,
  count(*) filter (where chain_classified_at is not null) as classified,
  count(*) filter (where chain_classified_at is null) as unclassified,
  count(*) filter (where is_chain = true) as chains_found,
  count(*) filter (where is_chain = false) as independent_found
from public.location_import_staging;
