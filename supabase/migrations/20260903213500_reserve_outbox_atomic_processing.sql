-- Process one claimed Reserve background event atomically so worker retries cannot
-- double-count service metrics if acknowledgement is interrupted.
create or replace function public.reserve_process_background_outbox(
  p_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.reserve_background_outbox%rowtype;
  v_res public.location_reservations%rowtype;
  v_service_date date;
  v_party_size integer := 1;
begin
  select * into v_event
    from public.reserve_background_outbox
   where id = p_id
     and status = 'processing'
   for update;

  if not found then
    return;
  end if;

  if v_event.reservation_id is not null then
    select * into v_res
      from public.location_reservations
     where id = v_event.reservation_id
       and location_id = v_event.location_id;
  end if;

  v_service_date := coalesce(
    v_res.reservation_date,
    nullif(v_event.payload->>'service_date','')::date,
    (v_event.created_at at time zone 'America/New_York')::date
  );
  v_party_size := greatest(
    1,
    coalesce(v_res.party_size, nullif(v_event.payload->>'party_size','')::integer, 1)
  );

  if v_event.event_type = 'reservation.seated' then
    perform public.reserve_increment_daily_metric(v_event.location_id, v_service_date, 'seated_parties', 1);
    perform public.reserve_increment_daily_metric(v_event.location_id, v_service_date, 'seated_covers', v_party_size);
  elsif v_event.event_type = 'waitlist.seated' then
    perform public.reserve_increment_daily_metric(v_event.location_id, v_service_date, 'waitlist_parties_seated', 1);
  elsif v_event.event_type = 'server.auto_assigned' then
    perform public.reserve_increment_daily_metric(v_event.location_id, v_service_date, 'automatic_server_assignments', 1);
  elsif v_event.event_type = 'manager.override' then
    perform public.reserve_increment_daily_metric(v_event.location_id, v_service_date, 'manager_overrides', 1);
  end if;

  update public.reserve_background_outbox
     set status = 'completed',
         updated_at = now(),
         last_error = null
   where id = p_id;
end;
$$;

revoke all on function public.reserve_process_background_outbox(uuid) from public, anon, authenticated;
grant execute on function public.reserve_process_background_outbox(uuid) to service_role;