-- Ensure the Location Editor can save optional search, hours, photo, and manual-source fields.
alter table public.locations
  add column if not exists search_keywords text[] default '{}',
  add column if not exists intent_tags text[] default '{}',
  add column if not exists vibe_tags text[] default '{}',
  add column if not exists date_style_tags text[] default '{}',
  add column if not exists special_features text[] default '{}',
  add column if not exists semantic_tags text[] default '{}',
  add column if not exists best_for_tags text[] default '{}',
  add column if not exists best_for text[] default '{}',
  add column if not exists tags text[] default '{}',
  add column if not exists semantic_search_text text,
  add column if not exists search_document text,
  add column if not exists primary_tag text,
  add column if not exists primary_category text,
  add column if not exists category text,
  add column if not exists cuisine text,
  add column if not exists cuisine_type text,
  add column if not exists activity_type text,
  add column if not exists short_description text,
  add column if not exists price_range text,
  add column if not exists neighborhood text,
  add column if not exists borough text,
  add column if not exists operating_hours jsonb,
  add column if not exists special_hours jsonb,
  add column if not exists google_regular_opening_hours jsonb,
  add column if not exists hours text,
  add column if not exists hours_source text,
  add column if not exists hours_confidence text,
  add column if not exists hours_last_backfilled_at timestamptz,
  add column if not exists hours_backfill_status text,
  add column if not exists hours_backfill_error text,
  add column if not exists main_image text,
  add column if not exists image_url text,
  add column if not exists images text[] default '{}',
  add column if not exists photo_status text,
  add column if not exists has_photos boolean,
  add column if not exists storage_photo_url text,
  add column if not exists google_photo_url text,
  add column if not exists profile_managed_by text,
  add column if not exists profile_manual_lock boolean default false,
  add column if not exists profile_owner_verified_at timestamptz,
  add column if not exists profile_last_owner_update_at timestamptz,
  add column if not exists profile_last_admin_update_at timestamptz,
  add column if not exists profile_field_sources jsonb default '{}'::jsonb,
  add column if not exists missing_fields text[] default '{}';

create index if not exists locations_search_keywords_gin on public.locations using gin (search_keywords);
create index if not exists locations_intent_tags_gin on public.locations using gin (intent_tags);
create index if not exists locations_vibe_tags_gin on public.locations using gin (vibe_tags);
create index if not exists locations_semantic_tags_gin on public.locations using gin (semantic_tags);
create index if not exists locations_best_for_tags_gin on public.locations using gin (best_for_tags);
create index if not exists locations_tags_gin on public.locations using gin (tags);
create index if not exists locations_images_gin on public.locations using gin (images);
