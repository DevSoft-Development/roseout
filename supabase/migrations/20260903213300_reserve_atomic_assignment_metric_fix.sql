-- Do not count moving an already-seated party as a new seating.
create or replace function public.reserve_assign_resource_atomic(
  p_reservation_id uuid,
  p_location_id uuid,
  p_resource_id uuid,
  p_resource_label text,
  p_resource_type text,
  p_resource_capacity integer,
  p_seat_after_assign boolean default true,
  p_staff_profile_id uuid default null,
  p_override_reason text default null
) returns public.location_reservations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_res public.location_reservations%rowtype;
  v_conflict_count integer := 0;
  v_now timestamptz := now();
  v_old jsonb;
  v_was_seated boolean := false;
begin
  select * into v_res
    from public.location_reservations
   where id = p_reservation_id and location_id = p_location_id
   for update;
  if not found then raise exception 'Reservation not found'; end if;

  v_was_seated := lower(coalesce(v_res.status,'')) in ('seated','occupied');

  if p_resource_capacity is not null and coalesce(v_res.party_size,1) > p_resource_capacity and p_override_reason is null then
    raise exception 'This table does not fit this party';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_location_id::text || ':' || lower(coalesce(p_resource_label,'')), 0));

  select count(*) into v_conflict_count
    from public.location_reservations r
   where r.location_id = p_location_id
     and r.id <> p_reservation_id
     and r.reservation_date = v_res.reservation_date
     and lower(coalesce(r.bookable_item_name,'')) = lower(coalesce(p_resource_label,''))
     and lower(coalesce(r.status,'')) in ('pending','confirmed','checked_in','waiting','arrived','seated','occupied')
     and (
       (extract(hour from r.reservation_time::time) * 60 + extract(minute from r.reservation_time::time))
         < (extract(hour from v_res.reservation_time::time) * 60 + extract(minute from v_res.reservation_time::time)) + coalesce(v_res.duration_minutes,v_res.turn_time_minutes,90)
       and
       (extract(hour from v_res.reservation_time::time) * 60 + extract(minute from v_res.reservation_time::time))
         < (extract(hour from r.reservation_time::time) * 60 + extract(minute from r.reservation_time::time)) + coalesce(r.duration_minutes,r.turn_time_minutes,90)
     );

  -- A manager may approve a capacity exception, but a hard overlapping table
  -- ownership conflict is never overridable.
  if v_conflict_count > 0 then
    raise exception 'That table was just assigned or conflicts with another reservation';
  end if;

  v_old := to_jsonb(v_res);
  update public.location_reservations
     set bookable_item_id = p_resource_id,
         bookable_item_name = p_resource_label,
         bookable_item_type = coalesce(nullif(p_resource_type,''),'table'),
         status = case when p_seat_after_assign and lower(coalesce(v_res.status,'')) in ('pending','confirmed','checked_in','waiting','arrived') then 'seated' else v_res.status end,
         checked_in_at = case when p_seat_after_assign and lower(coalesce(v_res.status,'')) in ('pending','confirmed') then coalesce(v_res.checked_in_at,v_now) else v_res.checked_in_at end,
         arrived_at = case when p_seat_after_assign and lower(coalesce(v_res.status,'')) in ('pending','confirmed') then coalesce(v_res.arrived_at,v_now) else v_res.arrived_at end,
         seated_at = case when p_seat_after_assign and lower(coalesce(v_res.status,'')) in ('pending','confirmed','checked_in','waiting','arrived') then coalesce(v_res.seated_at,v_now) else v_res.seated_at end,
         updated_at = v_now
   where id = p_reservation_id
   returning * into v_res;

  insert into public.reserve_service_events(location_id,reservation_id,staff_profile_id,event_type,resource_label,before_state,after_state,metadata)
  values (p_location_id,p_reservation_id,p_staff_profile_id,
          case when p_override_reason is null then 'reservation.resource_assigned' else 'reservation.resource_override' end,
          v_res.bookable_item_name,v_old,to_jsonb(v_res),jsonb_build_object('override_reason',p_override_reason));

  if p_seat_after_assign and not v_was_seated and lower(coalesce(v_res.status,'')) in ('seated','occupied') then
    insert into public.reserve_background_outbox(location_id,reservation_id,event_type,payload)
    values (p_location_id,p_reservation_id,'reservation.seated',jsonb_build_object('resource_label',v_res.bookable_item_name,'staff_profile_id',p_staff_profile_id));
  end if;

  if p_override_reason is not null then
    insert into public.reserve_background_outbox(location_id,reservation_id,event_type,payload)
    values (p_location_id,p_reservation_id,'manager.override',jsonb_build_object('resource_label',v_res.bookable_item_name,'reason',p_override_reason,'staff_profile_id',p_staff_profile_id));
  end if;

  return v_res;
end;
$$;

revoke all on function public.reserve_assign_resource_atomic(uuid,uuid,uuid,text,text,integer,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_assign_resource_atomic(uuid,uuid,uuid,text,text,integer,boolean,uuid,text) to service_role;