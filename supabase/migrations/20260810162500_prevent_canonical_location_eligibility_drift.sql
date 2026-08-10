-- Keep canonical location eligibility synchronized with all trusted backing
-- restaurant/activity rows. A disabled source must not disable a canonical
-- location when another valid source still backs the same Google Place.

create or replace function public.toh_location_source_eligibility(p_location_id uuid)
returns table (
  backing_source_count integer,
  expected_active boolean,
  expected_is_searchable boolean,
  expected_is_hidden boolean,
  expected_is_low_level boolean
)
language sql
stable
as $$
  with canonical as (
    select l.source_table, l.source_id, l.google_place_id
    from public.locations l
    where l.id = p_location_id
  ),
  backing_sources as (
    select
      'restaurants'::text as source_table,
      r.id as source_id,
      r.status,
      r.is_searchable,
      r.is_hidden,
      r.is_low_level
    from public.restaurants r
    cross join canonical c
    where (c.source_table = 'restaurants' and c.source_id = r.id)
       or (c.google_place_id is not null and r.google_place_id = c.google_place_id)

    union all

    select
      'activities'::text as source_table,
      a.id as source_id,
      a.status,
      a.is_searchable,
      a.is_hidden,
      a.is_low_level
    from public.activities a
    cross join canonical c
    where (c.source_table = 'activities' and c.source_id = a.id)
       or (c.google_place_id is not null and a.google_place_id = c.google_place_id)
  ),
  normalized as (
    select distinct on (source_table, source_id)
      source_table,
      source_id,
      coalesce(lower(nullif(trim(status), '')) in ('approved', 'active', 'published', 'live'), true) as source_active,
      coalesce(is_searchable, false) as source_searchable,
      coalesce(is_hidden, false) as source_hidden,
      coalesce(is_low_level, false) as source_low_level
    from backing_sources
    order by source_table, source_id
  )
  select
    count(*)::integer,
    coalesce(bool_or(source_active), false),
    coalesce(bool_or(source_active and source_searchable and not source_hidden and not source_low_level), false),
    coalesce(bool_and(source_hidden), false),
    coalesce(bool_and(source_low_level), false)
  from normalized;
$$;

create or replace function public.toh_reconcile_location_eligibility(p_location_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
  v_active boolean;
  v_searchable boolean;
  v_hidden boolean;
  v_low_level boolean;
  v_before record;
  v_changed boolean := false;
begin
  select active, is_searchable, is_hidden, is_low_level
  into v_before
  from public.locations
  where id = p_location_id;

  if not found then
    return false;
  end if;

  select backing_source_count, expected_active, expected_is_searchable, expected_is_hidden, expected_is_low_level
  into v_count, v_active, v_searchable, v_hidden, v_low_level
  from public.toh_location_source_eligibility(p_location_id);

  -- Native/canonical-only locations are intentionally untouched.
  if coalesce(v_count, 0) = 0 then
    return false;
  end if;

  v_changed :=
    v_before.active is distinct from v_active
    or v_before.is_searchable is distinct from v_searchable
    or v_before.is_hidden is distinct from v_hidden
    or v_before.is_low_level is distinct from v_low_level;

  if not v_changed then
    return false;
  end if;

  update public.locations
  set active = v_active,
      is_searchable = v_searchable,
      is_hidden = v_hidden,
      is_low_level = v_low_level
  where id = p_location_id;

  insert into public.location_search_profile_refresh_queue (
    location_id,
    reason,
    status,
    available_at,
    updated_at
  )
  select
    p_location_id,
    'canonical_eligibility_changed',
    'pending',
    now(),
    now()
  where not exists (
    select 1
    from public.location_search_profile_refresh_queue q
    where q.location_id = p_location_id
      and q.status in ('pending', 'processing')
  );

  update public.location_search_profile_refresh_queue
  set reason = 'canonical_eligibility_changed',
      available_at = now(),
      updated_at = now()
  where location_id = p_location_id
    and status in ('pending', 'processing');

  return true;
end;
$$;

create or replace function public.toh_sync_source_eligibility_to_locations()
returns trigger
language plpgsql
as $$
declare
  v_location_id uuid;
  v_table text := tg_table_name;
begin
  for v_location_id in
    select l.id
    from public.locations l
    where (l.source_table = v_table and l.source_id = new.id)
       or (
         new.google_place_id is not null
         and l.google_place_id = new.google_place_id
       )
  loop
    perform public.toh_reconcile_location_eligibility(v_location_id);
  end loop;

  return new;
end;
$$;

create or replace function public.toh_sync_location_identity_eligibility()
returns trigger
language plpgsql
as $$
begin
  perform public.toh_reconcile_location_eligibility(new.id);
  return new;
end;
$$;

drop trigger if exists toh_restaurant_location_eligibility_sync on public.restaurants;
create trigger toh_restaurant_location_eligibility_sync
after insert or update of status, is_searchable, is_hidden, is_low_level, google_place_id
on public.restaurants
for each row
execute function public.toh_sync_source_eligibility_to_locations();

drop trigger if exists toh_activity_location_eligibility_sync on public.activities;
create trigger toh_activity_location_eligibility_sync
after insert or update of status, is_searchable, is_hidden, is_low_level, google_place_id
on public.activities
for each row
execute function public.toh_sync_source_eligibility_to_locations();

drop trigger if exists toh_location_identity_eligibility_sync on public.locations;
create trigger toh_location_identity_eligibility_sync
after insert or update of source_table, source_id, google_place_id
on public.locations
for each row
execute function public.toh_sync_location_identity_eligibility();

create or replace function public.toh_find_location_eligibility_drift(p_limit integer default 100)
returns table (
  location_id uuid,
  name text,
  source_table text,
  source_id uuid,
  google_place_id text,
  backing_source_count integer,
  active boolean,
  expected_active boolean,
  is_searchable boolean,
  expected_is_searchable boolean,
  is_hidden boolean,
  expected_is_hidden boolean,
  is_low_level boolean,
  expected_is_low_level boolean
)
language sql
stable
as $$
  select
    l.id,
    l.name,
    l.source_table,
    l.source_id,
    l.google_place_id,
    e.backing_source_count,
    l.active,
    e.expected_active,
    l.is_searchable,
    e.expected_is_searchable,
    l.is_hidden,
    e.expected_is_hidden,
    l.is_low_level,
    e.expected_is_low_level
  from public.locations l
  cross join lateral public.toh_location_source_eligibility(l.id) e
  where e.backing_source_count > 0
    and (
      l.active is distinct from e.expected_active
      or l.is_searchable is distinct from e.expected_is_searchable
      or l.is_hidden is distinct from e.expected_is_hidden
      or l.is_low_level is distinct from e.expected_is_low_level
    )
  order by l.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.toh_repair_location_eligibility_drift(p_limit integer default 100)
returns table (location_id uuid, changed boolean)
language plpgsql
as $$
declare
  v_row record;
begin
  for v_row in
    select d.location_id
    from public.toh_find_location_eligibility_drift(greatest(1, least(coalesce(p_limit, 100), 500))) d
  loop
    location_id := v_row.location_id;
    changed := public.toh_reconcile_location_eligibility(v_row.location_id);
    return next;
  end loop;
end;
$$;

revoke all on function public.toh_location_source_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.toh_reconcile_location_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.toh_find_location_eligibility_drift(integer) from public, anon, authenticated;
revoke all on function public.toh_repair_location_eligibility_drift(integer) from public, anon, authenticated;
grant execute on function public.toh_location_source_eligibility(uuid) to service_role;
grant execute on function public.toh_reconcile_location_eligibility(uuid) to service_role;
grant execute on function public.toh_find_location_eligibility_drift(integer) to service_role;
grant execute on function public.toh_repair_location_eligibility_drift(integer) to service_role;
