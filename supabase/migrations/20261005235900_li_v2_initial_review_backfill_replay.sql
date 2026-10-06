-- toh:replicated-dml-reviewed
-- Replay the LI V2 initial review backfill after the original migration was
-- merged while the automatic dual-region deployment lane was blocked.
-- This is idempotent for already-due/refreshed rows: only enabled,
-- never-refreshed DataForSEO rows still scheduled in the future are moved due.

update public.location_review_refresh_state
set
  next_refresh_at = clock_timestamp(),
  refresh_enabled = true,
  updated_at = clock_timestamp()
where provider = 'dataforseo'
  and last_refreshed_at is null
  and refresh_enabled = true
  and next_refresh_at is not null
  and next_refresh_at > clock_timestamp();
