create extension if not exists pg_trgm;

create index if not exists idx_locations_explore_visible
on public.locations (is_searchable, data_status, is_hidden);

create index if not exists idx_locations_explore_featured_rating
on public.locations (is_featured desc, rating desc)
where is_searchable = true
and data_status = 'clean'
and is_hidden is not true
and coalesce(is_low_level, false) = false
and coalesce(public_visibility_tier, 'standard') not in ('low_level','hidden')
and coalesce(curation_tier, 'standard') <> 'low_level'
and coalesce(source_quality_status, 'enriched') not in ('imported_unverified','generic_restaurant','needs_enrichment','low_level_review')
and coalesce(import_confidence, 'unknown') <> 'low'
and coalesce(has_photos, false) = true
and coalesce(photo_status, '') <> 'missing_photo';

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
