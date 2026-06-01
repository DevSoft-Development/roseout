alter table public.locations
add column if not exists photo_source text,
add column if not exists photo_storage_path text,
add column if not exists photo_backfilled_at timestamptz,
add column if not exists photo_backfill_error text,
add column if not exists google_place_id text;

create table if not exists public.location_photo_backfill_logs (
id uuid primary key default gen_random_uuid(),
location_id uuid references public.locations(id) on delete cascade,
status text not null,
source text,
message text,
photo_url text,
storage_path text,
created_at timestamptz not null default now()
);

create index if not exists locations_photo_backfill_status_idx
on public.locations(photo_status, has_photos, enrichment_status)
where deleted_at is null;

create index if not exists locations_google_place_id_idx
on public.locations(google_place_id)
where deleted_at is null;

create index if not exists locations_google_photo_endpoint_repair_idx
on public.locations(photo_status, has_photos)
where deleted_at is null;

create index if not exists locations_completed_missing_photo_repair_idx
on public.locations(enrichment_status, photo_status, has_photos)
where deleted_at is null;
