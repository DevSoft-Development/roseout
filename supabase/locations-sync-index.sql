create extension if not exists pg_trgm;

-- Required for app/api/admin/sync-locations to upsert one public locations row
-- per source restaurants/activities row using onConflict: "source_table,source_id".
alter table public.locations
  add column if not exists source_table text,
  add column if not exists source_id text;

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
  add column if not exists special_features text[] default '{}',
  add column if not exists signature_items text[] default '{}',
  add column if not exists atmosphere text[] default '{}',
  add column if not exists external_reservation_url text,
  add column if not exists qr_link text,
  add column if not exists qr_code_data_url text,
  add column if not exists claim_qr_url text,
  add column if not exists claim_url text,
  add column if not exists claim_token text,
  add column if not exists reservation_url text,
  add column if not exists reservation_link text,
  add column if not exists theouthaven_score numeric default 0,
  add column if not exists search_document text,
  add column if not exists missing_fields text[] default '{}',
  add column if not exists data_status text default 'needs_review',
  add column if not exists is_searchable boolean default false,
  add column if not exists last_quality_check_at timestamptz,
  add column if not exists is_hidden boolean default false,
  add column if not exists is_featured boolean default false,
  add column if not exists is_verified boolean default false,
  add column if not exists reservation_enabled boolean default false,
  add column if not exists operating_hours jsonb,
  add column if not exists special_hours jsonb,
  add column if not exists holiday_closures jsonb;

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
