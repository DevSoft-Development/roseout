create extension if not exists pg_trgm;

create index if not exists locations_name_trgm_idx
  on public.locations using gin (lower(coalesce(name, '')) gin_trgm_ops);
create index if not exists locations_restaurant_name_trgm_idx
  on public.locations using gin (lower(coalesce(restaurant_name, '')) gin_trgm_ops);
create index if not exists locations_activity_name_trgm_idx
  on public.locations using gin (lower(coalesce(activity_name, '')) gin_trgm_ops);
create index if not exists locations_primary_category_trgm_idx
  on public.locations using gin (lower(coalesce(primary_category, '')) gin_trgm_ops);
create index if not exists locations_activity_type_trgm_idx
  on public.locations using gin (lower(coalesce(activity_type, '')) gin_trgm_ops);
create index if not exists search_anchors_normalized_name_trgm_idx
  on public.search_anchors using gin (lower(coalesce(normalized_name, '')) gin_trgm_ops);
create index if not exists search_anchors_active_lookup_idx
  on public.search_anchors (is_active, is_searchable, review_status);

comment on index public.locations_name_trgm_idx is
  'Supports bounded ILIKE anchor-name resolution without sequentially scanning locations.';
