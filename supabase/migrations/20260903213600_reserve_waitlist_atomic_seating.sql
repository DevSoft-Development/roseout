create or replace function public.reserve_seat_waitlist_atomic(
  p_waitlist_id uuid,
  p_location_id uuid,
  p_resource_id uuid,
  p_resource_label text,
  p_resource_type text,
  p_resource_capacity integer,
  p_staff_profile_id uuid default null
) returns public.location_reservations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wait public.reservation_waitlist%rowtype;
  v_res public.location_reservations%rowtype;
  v_location_type text;
  v_now timestamptz := now();
  v_service_date date;
  v_service_time time;
begin
  select * into v_wait
    from public.reservation_waitlist
   where id = p_waitlist_id
     and location_id = p_location_id
     and lower(coalesce(status,'')) in ('waiting','waitlisted','notified','pending')
   for update;

  if not found then
    raise exception 'This waitlist entry is no longer active.';
  end if;

  if v_wait.converted_reservation_id is not null then
    raise exception 'This waitlist entry has already been converted.';
  end if;

  select location_type into v_location_type
    from public.locations
   where id = p_location_id;

  v_service_date := coalesce(
    v_wait.reservation_date,
    (v_now at time zone 'America/New_York')::date
  );
  v_service_time := coalesce(
    v_wait.reservation_time,
    (v_now at time zone 'America/New_York')::time
  );

  insert into public.location_reservations(
    location_id,
    location_type,
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    reservation_date,
    reservation_time,
    status,
    source,
    special_request,
    special_requests,
    duration_minutes,
    checked_in_at,
    arrived_at,
    updated_at
  ) values (
    p_location_id,
    coalesce(nullif(v_location_type,''),'restaurant'),
    coalesce(nullif(trim(coalesce(v_wait.contact_name,v_wait.customer_name,'')),''),'Walk-in guest'),
    coalesce(v_wait.contact_phone,v_wait.customer_phone),
    v_wait.contact_email,
    greatest(1,coalesce(v_wait.party_size,1)),
    v_service_date,
    v_service_time,
    'checked_in',
    'host_waitlist',
    v_wait.notes,
    v_wait.notes,
    90,
    v_now,
    v_now,
    v_now
  ) returning * into v_res;

  select * into v_res
    from public.reserve_assign_resource_atomic(
      v_res.id,
      p_location_id,
      p_resource_id,
      p_resource_label,
      p_resource_type,
      p_resource_capacity,
      true,
      p_staff_profile_id,
      null
    );

  update public.reservation_waitlist
     set status = 'seated',
         assigned_layout_item_id = p_resource_id,
         converted_reservation_id = v_res.id,
         converted_at = v_now
   where id = p_waitlist_id
     and location_id = p_location_id;

  insert into public.reserve_service_events(
    location_id,
    reservation_id,
    staff_profile_id,
    event_type,
    resource_label,
    metadata
  ) values (
    p_location_id,
    v_res.id,
    p_staff_profile_id,
    'waitlist.converted_and_seated',
    v_res.bookable_item_name,
    jsonb_build_object('waitlist_id',p_waitlist_id)
  );

  insert into public.reserve_background_outbox(
    location_id,
    reservation_id,
    event_type,
    payload
  ) values (
    p_location_id,
    v_res.id,
    'waitlist.seated',
    jsonb_build_object(
      'waitlist_id',p_waitlist_id,
      'service_date',v_service_date,
      'party_size',v_res.party_size
    )
  );

  return v_res;
end;
$$;

revoke all on function public.reserve_seat_waitlist_atomic(uuid,uuid,uuid,text,text,integer,uuid) from public, anon, authenticated;
grant execute on function public.reserve_seat_waitlist_atomic(uuid,uuid,uuid,text,text,integer,uuid) to service_role;