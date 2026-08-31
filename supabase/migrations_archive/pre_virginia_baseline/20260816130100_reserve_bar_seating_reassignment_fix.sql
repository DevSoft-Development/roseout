-- Harden bar-seat reassignment for edits after a reservation already owns multiple seats.
create or replace function public.reserve_bar_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  terminal boolean;
  normalized_type text;
  requested_label text;
  anchor_label text;
  target_seat public.reservation_seating_resources%rowtype;
  parent_id uuid;
  party integer;
  start_index integer;
  chosen uuid[];
  chosen_labels text[];
  candidate_start integer;
  overlap_count integer;
  duration_minutes integer;
  reservation_start integer;
begin
  terminal := lower(coalesce(new.status,'')) in ('completed','cancelled','declined','no_show');
  if terminal then
    delete from public.reservation_resource_assignments where reservation_id = new.id;
    return new;
  end if;

  normalized_type := replace(lower(coalesce(new.bookable_item_type,'')), ' ', '_');
  if normalized_type not in ('bar','bar_seat','counter','counter_seat') then
    return new;
  end if;

  requested_label := trim(coalesce(new.bookable_item_name,''));
  anchor_label := trim(split_part(requested_label, ',', 1));
  party := greatest(1, coalesce(new.party_size,1));
  duration_minutes := greatest(1, coalesce(new.duration_minutes, new.turn_time_minutes, 90));
  reservation_start := public.reserve_minutes(coalesce(new.reservation_time::text,'00:00'));

  select s.* into target_seat
  from public.reservation_seating_resources s
  where s.location_id = new.location_id
    and lower(s.label) = lower(anchor_label)
    and s.is_active
  limit 1;

  if found then
    parent_id := target_seat.parent_layout_item_id;
    start_index := target_seat.seat_index;
  else
    select l.id into parent_id
    from public.layout_items l
    where l.location_id = new.location_id
      and public.reserve_is_bar_type(l.item_type)
      and lower(trim(l.item_name)) = lower(anchor_label)
      and coalesce(l.is_active,true)
    limit 1;
    start_index := 1;
  end if;

  if parent_id is null then
    raise exception 'Bar seating resource was not found. Refresh the floor and try again.';
  end if;

  -- Search every possible start position, preferring the stool the host tapped (or the
  -- reservation's first currently assigned stool), then the nearest block on either side.
  for candidate_start in
    select s.seat_index
    from public.reservation_seating_resources s
    where s.parent_layout_item_id = parent_id and s.is_active
    order by abs(s.seat_index - start_index), s.seat_index
  loop
    select array_agg(s.id order by s.seat_index), array_agg(s.label order by s.seat_index)
      into chosen, chosen_labels
    from public.reservation_seating_resources s
    where s.parent_layout_item_id = parent_id
      and s.is_active
      and s.seat_index between candidate_start and candidate_start + party - 1;

    if coalesce(array_length(chosen,1),0) <> party then
      chosen := null;
      chosen_labels := null;
      continue;
    end if;

    select count(*) into overlap_count
    from public.reservation_resource_assignments a
    join public.location_reservations r on r.id = a.reservation_id
    where a.seating_resource_id = any(chosen)
      and r.id <> new.id
      and lower(coalesce(r.status,'')) in ('pending','confirmed','checked_in','waiting','arrived','seated')
      and r.reservation_date = new.reservation_date
      and reservation_start < public.reserve_minutes(coalesce(r.reservation_time::text,'00:00')) + greatest(1,coalesce(r.duration_minutes,r.turn_time_minutes,90))
      and public.reserve_minutes(coalesce(r.reservation_time::text,'00:00')) < reservation_start + duration_minutes;

    if overlap_count = 0 then
      exit;
    end if;
    chosen := null;
    chosen_labels := null;
  end loop;

  if coalesce(array_length(chosen,1),0) <> party then
    raise exception 'There are not enough adjacent bar seats available for this party at that time.';
  end if;

  delete from public.reservation_resource_assignments where reservation_id = new.id;
  insert into public.reservation_resource_assignments(reservation_id, location_id, seating_resource_id)
    select new.id, new.location_id, unnest(chosen);

  new.bookable_item_id := null;
  new.bookable_item_type := case when normalized_type like 'counter%' then 'counter_seat' else 'bar_seat' end;
  new.bookable_item_name := array_to_string(chosen_labels, ', ');
  return new;
end;
$$;
