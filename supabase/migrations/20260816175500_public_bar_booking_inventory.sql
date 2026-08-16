-- Make bar/counter layout containers visible to the public reservation inventory without
-- exposing individual stool resources. The existing bar seating trigger remains the
-- source of truth for adjacent stool assignment and conflict detection.

create or replace function public.reserve_sync_bar_bookable_item(layout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.layout_items%rowtype;
  normalized_location_type text;
  active_value boolean;
begin
  select * into r from public.layout_items where id = layout_id;
  if not found then return; end if;

  if not public.reserve_is_bar_type(r.item_type) then
    update public.location_bookable_items
      set is_active = false, updated_at = now()
      where id = r.id and public.reserve_is_bar_type(item_type);
    return;
  end if;

  normalized_location_type := case
    when lower(coalesce(r.source_table, '')) in ('activity', 'activities') then 'activity'
    else 'restaurant'
  end;
  active_value := coalesce(r.is_active, true)
    and coalesce(lower(r.status), 'available') not in ('blocked','closed','maintenance','hidden','unavailable');

  -- A bar is represented as one public booking option whose capacity is the number
  -- of stools. Exact stools stay private and are assigned by reserve_bar_assignments_before_write().
  insert into public.location_bookable_items(
    id,
    location_id,
    location_type,
    item_name,
    item_type,
    capacity_min,
    capacity_max,
    is_active,
    max_concurrent,
    slot_duration_minutes,
    auto_confirm,
    item_label,
    layout_x,
    layout_y,
    layout_width,
    layout_height,
    layout_zone,
    updated_at
  ) values (
    r.id,
    r.location_id,
    normalized_location_type,
    coalesce(nullif(trim(r.item_name), ''), 'Bar Seating'),
    case when replace(lower(coalesce(r.item_type,'')), ' ', '_') like 'counter%' then 'counter_seat' else 'bar_seat' end,
    1,
    greatest(1, coalesce(r.capacity, 1)),
    active_value,
    greatest(1, coalesce(r.capacity, 1)),
    greatest(1, coalesce(r.duration_minutes, r.default_duration_minutes, r.reservation_duration_minutes, 90)),
    true,
    coalesce(nullif(trim(r.item_name), ''), 'Bar Seating'),
    coalesce(r.x_position, 0),
    coalesce(r.y_position, 0),
    greatest(1, coalesce(r.width, 1)),
    greatest(1, coalesce(r.height, 1)),
    'Bar Seating',
    now()
  )
  on conflict (id) do update set
    location_id = excluded.location_id,
    location_type = excluded.location_type,
    item_name = excluded.item_name,
    item_type = excluded.item_type,
    capacity_min = excluded.capacity_min,
    capacity_max = excluded.capacity_max,
    is_active = excluded.is_active,
    max_concurrent = excluded.max_concurrent,
    slot_duration_minutes = excluded.slot_duration_minutes,
    auto_confirm = excluded.auto_confirm,
    item_label = excluded.item_label,
    layout_x = excluded.layout_x,
    layout_y = excluded.layout_y,
    layout_width = excluded.layout_width,
    layout_height = excluded.layout_height,
    layout_zone = excluded.layout_zone,
    updated_at = now();

  -- Deactivate legacy duplicate aggregate rows with the same semantic bar name so
  -- public availability has one canonical bar option per layout container.
  update public.location_bookable_items
    set is_active = false, updated_at = now()
    where location_id = r.location_id
      and id <> r.id
      and public.reserve_is_bar_type(item_type)
      and lower(trim(item_name)) = lower(trim(coalesce(nullif(r.item_name,''), 'Bar Seating')));
end;
$$;

create or replace function public.reserve_sync_bar_bookable_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reserve_sync_bar_bookable_item(new.id);
  return new;
end;
$$;

drop trigger if exists reserve_sync_bar_bookable_item_trigger on public.layout_items;
create trigger reserve_sync_bar_bookable_item_trigger
after insert or update of item_type, item_name, capacity, is_active, status, source_table,
  duration_minutes, default_duration_minutes, reservation_duration_minutes,
  x_position, y_position, width, height
on public.layout_items
for each row execute function public.reserve_sync_bar_bookable_item_trigger();

-- Backfill existing bar/counter containers into public aggregate booking options.
do $$
declare r record;
begin
  for r in select id from public.layout_items where public.reserve_is_bar_type(item_type)
  loop
    perform public.reserve_sync_bar_bookable_item(r.id);
  end loop;
end $$;
