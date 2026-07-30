-- Recover canonical profile coverage through the active bulk-run worker.
--
-- This migration intentionally does not use location_search_profile_refresh_queue:
-- production workers claim location_search_profile_run_items through
-- claim_location_search_profile_items(...).

begin;

-- Retry only failures caused by the two confirmed rollout defects. Other
-- failures keep their current attempts and diagnostics for separate review.
update public.location_search_profile_run_items
set
  status = 'pending',
  attempts = 0,
  available_at = now(),
  lease_owner = null,
  lease_expires_at = null,
  last_error = null,
  result = null,
  started_at = null,
  completed_at = null,
  updated_at = now()
where status = 'failed'
  and (
    coalesce(last_error ->> 'message', '') ilike '%column locations.categories does not exist%'
    or coalesce(last_error ->> 'message', '') ilike '%location_search_profile_run_items_status_check%'
  );

-- Re-open runs that now contain retryable work.
update public.location_search_profile_runs r
set
  status = 'running',
  completed_at = null,
  updated_at = now()
where exists (
  select 1
  from public.location_search_profile_run_items i
  where i.run_id = r.id
    and i.status in ('pending', 'processing')
);

-- Build one bounded recovery run for searchable locations that still have no
-- profile and activity profiles that remain termless or review-needed.
do $$
declare
  v_run_id uuid := gen_random_uuid();
  v_target_count integer := 0;
begin
  insert into public.location_search_profile_runs (
    id,
    status,
    mode,
    filters,
    configuration,
    target_count,
    processed_count,
    succeeded_count,
    failed_count,
    skipped_count,
    needs_review_count,
    started_at,
    created_at,
    updated_at
  )
  values (
    v_run_id,
    'running',
    'activity_coverage_recovery',
    jsonb_build_object(
      'missing_profiles', true,
      'activity_termless_or_review', true
    ),
    jsonb_build_object(
      'source', '20260729235000_requeue_activity_profile_coverage',
      'profile_version_minimum', 3
    ),
    0,
    0,
    0,
    0,
    0,
    0,
    now(),
    now(),
    now()
  );

  insert into public.location_search_profile_run_items (
    run_id,
    location_id,
    status,
    attempts,
    max_attempts,
    available_at,
    created_at,
    updated_at
  )
  select
    v_run_id,
    l.id,
    'pending',
    0,
    3,
    now(),
    now(),
    now()
  from public.locations l
  left join public.location_search_profiles p
    on p.location_id = l.id
  where l.active = true
    and l.is_searchable = true
    and l.is_hidden = false
    and l.is_low_level = false
    and (
      p.location_id is null
      or (
        p.primary_domain = 'activity'
        and (
          coalesce(cardinality(p.canonical_terms), 0) = 0
          or coalesce(p.needs_review, false) = true
        )
      )
    )
    and not exists (
      select 1
      from public.location_search_profile_run_items existing
      where existing.location_id = l.id
        and existing.status in ('pending', 'processing')
    );

  get diagnostics v_target_count = row_count;

  if v_target_count = 0 then
    delete from public.location_search_profile_runs
    where id = v_run_id;
  else
    update public.location_search_profile_runs
    set target_count = v_target_count,
        updated_at = now()
    where id = v_run_id;
  end if;
end
$$;

-- Remove the dead-letter recovery rows created by the earlier migration draft.
-- They are now represented by active run items and would otherwise imply that
-- a separate refresh-queue worker exists in production.
delete from public.location_search_profile_refresh_queue
where reason in (
  'activity_coverage_missing_profile',
  'activity_coverage_termless_profile'
)
  and status = 'pending';

commit;
