create extension if not exists pg_trgm;

create index if not exists idx_locations_explore_visible
on public.locations (is_searchable, data_status, is_hidden);

create index if not exists idx_locations_explore_featured_rating
on public.locations (is_featured desc, rating desc)
where is_searchable = true
and data_status = 'clean'
and is_hidden is not true;

create index if not exists idx_locations_search_document_trgm
on public.locations
using gin (search_document gin_trgm_ops);

create index if not exists idx_locations_name_trgm
on public.locations
using gin (name gin_trgm_ops);

create index if not exists idx_locations_restaurant_name_trgm
on public.locations
using gin (restaurant_name gin_trgm_ops);

create index if not exists idx_locations_activity_name_trgm
on public.locations
using gin (activity_name gin_trgm_ops);

create index if not exists idx_locations_city_trgm
on public.locations
using gin (city gin_trgm_ops);

create index if not exists idx_locations_borough_trgm
on public.locations
using gin (borough gin_trgm_ops);

create index if not exists idx_locations_neighborhood_trgm
on public.locations
using gin (neighborhood gin_trgm_ops);
