-- toh:replicated-dml-reviewed
-- Make existing never-refreshed DataForSEO review rows immediately eligible
-- for the initial review backfill. The maintenance worker itself remains
-- batch-limited, so this does not fan out provider calls all at once.

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
