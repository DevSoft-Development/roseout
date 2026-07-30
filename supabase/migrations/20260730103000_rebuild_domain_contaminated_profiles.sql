-- Rebuild only profiles affected by restaurant/nightlife contamination or
-- missing activity canonical terms. This intentionally avoids a full backfill.

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
    'domain_correctness_recovery',
    jsonb_build_object(
      'restaurant_nightlife_contamination', true,
      'activity_missing_canonical_terms', true
    ),
    jsonb_build_object(
      'source', '20260730103000_rebuild_domain_contaminated_profiles',
      'targeted_only', true
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
    p.location_id,
    'pending',
    0,
    3,
    now(),
    now(),
    now()
  from public.location_search_profiles p
  join public.locations l
    on l.id = p.location_id
  where l.active = true
    and l.is_searchable = true
    and l.is_hidden = false
    and l.is_low_level = false
    and (
      (
        p.primary_domain = 'restaurant'
        and coalesce(cardinality(p.restaurant_categories), 0) = 0
        and coalesce(cardinality(p.nightlife_categories), 0) > 0
      )
      or (
        p.primary_domain = 'activity'
        and coalesce(cardinality(p.canonical_terms), 0) = 0
      )
    )
    and not exists (
      select 1
      from public.location_search_profile_run_items existing
      where existing.location_id = p.location_id
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
