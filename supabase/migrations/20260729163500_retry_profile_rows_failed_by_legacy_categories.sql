begin;

with affected as (
  select id, run_id
  from public.location_search_profile_run_items
  where status = 'failed'
    and coalesce(last_error ->> 'message', error, '') =
      'Location read failed: column locations.categories does not exist'
), reset_items as (
  update public.location_search_profile_run_items item
  set
    status = 'pending',
    attempts = 0,
    attempt_count = 0,
    available_at = now(),
    lease_owner = null,
    locked_by = null,
    locked_at = null,
    lease_expires_at = null,
    last_error = null,
    error = null,
    completed_at = null,
    updated_at = now()
  from affected
  where item.id = affected.id
  returning item.run_id
), affected_runs as (
  select distinct run_id from reset_items
), counts as (
  select
    item.run_id,
    count(*) filter (where item.status = 'succeeded')::integer as succeeded_count,
    count(*) filter (
      where item.status = 'failed'
        and coalesce(item.attempts, item.attempt_count, 0) >= coalesce(item.max_attempts, 3)
    )::integer as failed_count,
    count(*) filter (where item.status = 'skipped')::integer as skipped_count,
    count(*) filter (
      where item.status = 'succeeded'
        and coalesce((item.result ->> 'needs_review')::boolean, false)
    )::integer as needs_review_count,
    count(*) filter (
      where item.status in ('succeeded', 'skipped', 'cancelled')
         or (
           item.status = 'failed'
           and coalesce(item.attempts, item.attempt_count, 0) >= coalesce(item.max_attempts, 3)
         )
    )::integer as processed_count
  from public.location_search_profile_run_items item
  join affected_runs run on run.run_id = item.run_id
  group by item.run_id
)
update public.location_search_profile_runs run
set
  status = 'running',
  processed_count = counts.processed_count,
  succeeded_count = counts.succeeded_count,
  failed_count = counts.failed_count,
  skipped_count = counts.skipped_count,
  needs_review_count = counts.needs_review_count,
  completed_at = null,
  updated_at = now()
from counts
where run.id = counts.run_id;

commit;

notify pgrst, 'reload schema';
