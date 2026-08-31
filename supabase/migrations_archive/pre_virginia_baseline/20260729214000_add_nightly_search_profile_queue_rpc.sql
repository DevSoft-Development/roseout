create or replace function public.enqueue_nightly_location_search_profile_run(
  p_limit integer default 1500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1500), 1), 10000);
  v_run_id uuid;
  v_target_count integer := 0;
  v_existing_run record;
  v_now timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtext('nightly_location_search_profile_queue'));

  select id, status, target_count, processed_count, created_at
  into v_existing_run
  from public.location_search_profile_runs
  where mode = 'nightly_priority_rebuild'
    and status in ('pending', 'running', 'cancelling')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'reason', 'active_run_exists',
      'run_id', v_existing_run.id,
      'status', v_existing_run.status,
      'target_count', coalesce(v_existing_run.target_count, 0),
      'processed_count', coalesce(v_existing_run.processed_count, 0),
      'created_at', v_existing_run.created_at
    );
  end if;

  insert into public.location_search_profile_runs (
    mode,
    filters,
    configuration,
    requested_by,
    status,
    created_at,
    updated_at
  )
  values (
    'nightly_priority_rebuild',
    jsonb_build_object(
      'active', true,
      'searchable', true,
      'hidden', false,
      'low_level', false,
      'priority', jsonb_build_array('missing_profile', 'needs_review', 'unverified')
    ),
    jsonb_build_object(
      'source', 'nightly-search-profile-queue-edge',
      'requested_limit', v_limit,
      'deduplicated', true
    ),
    null,
    'pending',
    v_now,
    v_now
  )
  returning id into v_run_id;

  with prioritized as (
    select l.id as location_id
    from public.locations l
    left join public.location_search_profiles p on p.location_id = l.id
    where l.active = true
      and l.is_searchable = true
      and l.is_hidden = false
      and l.is_low_level = false
      and (
        p.location_id is null
        or p.needs_review = true
        or p.verified_at is null
      )
      and not exists (
        select 1
        from public.location_search_profile_run_items existing_item
        join public.location_search_profile_runs existing_run
          on existing_run.id = existing_item.run_id
        where existing_item.location_id = l.id
          and existing_item.status in ('pending', 'processing')
          and existing_run.status in ('pending', 'running', 'cancelling')
      )
    order by
      (p.location_id is null) desc,
      coalesce(p.needs_review, false) desc,
      (p.verified_at is null) desc,
      p.updated_at asc nulls first,
      l.id asc
    limit v_limit
  ), inserted as (
    insert into public.location_search_profile_run_items (
      run_id,
      location_id,
      status,
      available_at,
      created_at,
      updated_at
    )
    select
      v_run_id,
      prioritized.location_id,
      'pending',
      v_now,
      v_now,
      v_now
    from prioritized
    on conflict do nothing
    returning 1
  )
  select count(*) into v_target_count from inserted;

  update public.location_search_profile_runs
  set
    target_count = v_target_count,
    status = case when v_target_count > 0 then 'running' else 'completed' end,
    started_at = case when v_target_count > 0 then v_now else null end,
    completed_at = case when v_target_count = 0 then v_now else null end,
    updated_at = v_now
  where id = v_run_id;

  return jsonb_build_object(
    'created', true,
    'run_id', v_run_id,
    'status', case when v_target_count > 0 then 'running' else 'completed' end,
    'target_count', v_target_count,
    'requested_limit', v_limit,
    'priority_order', jsonb_build_array('missing_profile', 'needs_review', 'unverified', 'oldest_profile')
  );
end;
$$;

revoke all on function public.enqueue_nightly_location_search_profile_run(integer) from public;
grant execute on function public.enqueue_nightly_location_search_profile_run(integer) to service_role;

comment on function public.enqueue_nightly_location_search_profile_run(integer) is
  'Atomically creates one nightly priority search-profile rebuild run, while preventing overlapping nightly runs.';
