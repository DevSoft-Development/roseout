create extension if not exists pg_trgm;

-- Required for app/api/admin/sync-locations to upsert one public locations row
-- per source restaurants/activities row using onConflict: "source_table,source_id".
create unique index if not exists locations_source_table_source_id_idx
  on public.locations (source_table, source_id);

-- Rich public-search fields populated by the locations sync job.
alter table public.locations
  add column if not exists restaurant_name text,
  add column if not exists activity_name text,
  add column if not exists primary_category text,
  add column if not exists cuisine text,
  add column if not exists cuisine_type text,
  add column if not exists activity_type text,
  add column if not exists primary_tag text,
  add column if not exists tags text[] default '{}',
  add column if not exists vibe_tags text[] default '{}',
  add column if not exists best_for_tags text[] default '{}',
  add column if not exists google_types text[] default '{}',
  add column if not exists search_keywords text[] default '{}',
  add column if not exists review_keywords text[] default '{}',
  add column if not exists date_style_tags text[] default '{}',
  add column if not exists best_for text[] default '{}',
  add column if not exists atmosphere text[] default '{}',
  add column if not exists search_document text;

create index if not exists locations_public_search_idx
  on public.locations (is_searchable, data_status, location_type)
  where is_hidden is not true;

create index if not exists locations_search_document_trgm_idx
  on public.locations using gin (search_document gin_trgm_ops);

create index if not exists locations_tags_gin_idx
  on public.locations using gin (tags);

create index if not exists locations_search_keywords_gin_idx
  on public.locations using gin (search_keywords);

create index if not exists locations_google_types_gin_idx
  on public.locations using gin (google_types);
