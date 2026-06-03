alter table if exists public.locations
  add column if not exists chain_classified_at timestamptz,
  add column if not exists chain_classification_reason text,
  add column if not exists chain_confidence numeric;

alter table if exists public.location_import_staging
  add column if not exists chain_classified_at timestamptz,
  add column if not exists chain_classification_reason text,
  add column if not exists chain_confidence numeric;

create index if not exists idx_locations_chain_classified_at
  on public.locations(chain_classified_at);

create index if not exists idx_location_import_staging_chain_classified_at
  on public.location_import_staging(chain_classified_at);

create index if not exists idx_locations_is_chain
  on public.locations(is_chain);

create index if not exists idx_location_import_staging_is_chain
  on public.location_import_staging(is_chain);
