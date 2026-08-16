alter table public.locations
  add column if not exists gap_repair_google_next_attempt_at timestamptz;

create index if not exists idx_locations_gap_repair_google_next_attempt_at
  on public.locations (gap_repair_google_next_attempt_at)
  where deleted_at is null;
