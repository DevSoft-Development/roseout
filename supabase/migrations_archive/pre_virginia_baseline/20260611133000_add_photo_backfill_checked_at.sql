alter table public.locations
add column if not exists photo_backfill_checked_at timestamptz;

create index if not exists idx_locations_photo_backfill_checked_at
on public.locations(photo_backfill_checked_at desc);

create index if not exists idx_locations_missing_photo_backfill
on public.locations(quality_score, duplicate_status, enrichment_status)
where has_photos = false or photo_status = 'missing_photo';
