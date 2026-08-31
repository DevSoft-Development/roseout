alter table public.locations
  add column if not exists gap_repair_status text,
  add column if not exists gap_repair_last_checked_at timestamptz,
  add column if not exists gap_repair_next_attempt_at timestamptz,
  add column if not exists gap_repair_error text,
  add column if not exists gap_repair_google_calls integer not null default 0;

create index if not exists locations_gap_repair_due_idx
  on public.locations (gap_repair_next_attempt_at, gap_repair_last_checked_at)
  where deleted_at is null;

comment on column public.locations.gap_repair_status is
  'Unified core-data repair status for hours, website, phone, and reservation discovery.';
comment on column public.locations.gap_repair_next_attempt_at is
  'Earliest time the unified gap repair worker should retry this location.';
comment on column public.locations.gap_repair_google_calls is
  'Cumulative Google API calls made by the unified gap repair worker for this location.';
