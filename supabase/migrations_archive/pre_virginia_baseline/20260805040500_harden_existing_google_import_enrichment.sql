begin;

alter table if exists public.restaurants
  add column if not exists hours_json jsonb,
  add column if not exists hours_status text,
  add column if not exists hours_source text,
  add column if not exists hours_verified_at timestamptz,
  add column if not exists reservation_provider text,
  add column if not exists reservation_status text,
  add column if not exists reservation_source text,
  add column if not exists reservation_verified_at timestamptz,
  add column if not exists image_storage_path text,
  add column if not exists image_status text,
  add column if not exists image_cached_at timestamptz,
  add column if not exists canonical_profile_status text,
  add column if not exists canonical_profile_queued_at timestamptz,
  add column if not exists import_quality_score integer,
  add column if not exists publishing_readiness text,
  add column if not exists import_last_error text,
  add column if not exists import_attempt_count integer not null default 0,
  add column if not exists imported_at timestamptz;

alter table if exists public.activities
  add column if not exists hours_json jsonb,
  add column if not exists hours_status text,
  add column if not exists hours_source text,
  add column if not exists hours_verified_at timestamptz,
  add column if not exists reservation_provider text,
  add column if not exists reservation_status text,
  add column if not exists reservation_source text,
  add column if not exists reservation_verified_at timestamptz,
  add column if not exists image_storage_path text,
  add column if not exists image_status text,
  add column if not exists image_cached_at timestamptz,
  add column if not exists canonical_profile_status text,
  add column if not exists canonical_profile_queued_at timestamptz,
  add column if not exists import_quality_score integer,
  add column if not exists publishing_readiness text,
  add column if not exists import_last_error text,
  add column if not exists import_attempt_count integer not null default 0,
  add column if not exists imported_at timestamptz;

alter table if exists public.import_logs
  add column if not exists status text,
  add column if not exists market text,
  add column if not exists checked_count integer,
  add column if not exists inserted_count integer,
  add column if not exists updated_count integer,
  add column if not exists skipped_count integer,
  add column if not exists duplicate_count integer,
  add column if not exists failed_count integer,
  add column if not exists hours_saved_count integer,
  add column if not exists reservation_count integer,
  add column if not exists images_cached_count integer,
  add column if not exists profiles_queued_count integer,
  add column if not exists published_count integer,
  add column if not exists needs_review_count integer,
  add column if not exists failure_reasons jsonb not null default '{}'::jsonb,
  add column if not exists market_summary jsonb not null default '{}'::jsonb,
  add column if not exists enrichment_summary jsonb not null default '{}'::jsonb;

create index if not exists restaurants_google_place_id_idx
  on public.restaurants (google_place_id)
  where google_place_id is not null;

create index if not exists activities_google_place_id_idx
  on public.activities (google_place_id)
  where google_place_id is not null;

create index if not exists restaurants_publishing_readiness_idx
  on public.restaurants (publishing_readiness);

create index if not exists activities_publishing_readiness_idx
  on public.activities (publishing_readiness);

-- The application already expects claim_code on location claim records. Add it only
-- when the table exists so environments with older schemas stop silently dropping it.
do $$
begin
  if to_regclass('public.location_claim_codes') is not null then
    execute 'alter table public.location_claim_codes add column if not exists claim_code text';
    execute 'create unique index if not exists location_claim_codes_claim_code_idx on public.location_claim_codes (claim_code) where claim_code is not null';
  end if;
end $$;

commit;
