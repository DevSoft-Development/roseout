alter table public.locations add column if not exists google_regular_opening_hours jsonb;
alter table public.locations add column if not exists google_current_opening_hours jsonb;
alter table public.locations add column if not exists google_utc_offset_minutes integer;
alter table public.locations add column if not exists hours_last_backfilled_at timestamptz;
alter table public.locations add column if not exists hours_backfill_status text default 'not_started';
alter table public.locations add column if not exists hours_backfill_error text;
alter table public.locations add column if not exists hours_confidence text default 'unknown';
alter table public.locations add column if not exists hours_source text;
alter table public.locations add column if not exists hours_raw jsonb;

create index if not exists locations_hours_backfill_status_idx on public.locations (hours_backfill_status);
create index if not exists locations_hours_last_backfilled_at_idx on public.locations (hours_last_backfilled_at);
create index if not exists locations_google_place_id_hours_idx on public.locations (google_place_id) where google_place_id is not null;
