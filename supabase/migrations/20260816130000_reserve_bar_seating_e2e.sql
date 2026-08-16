-- E2E bar/counter seating for TheOutHaven Reserve.
-- A layout_items row with item_type bar_seat/counter_seat/bar/counter is the container.
-- Its capacity is the number of physical stools/seats. Individual seats are materialized
-- in reservation_seating_resources and reservations can own multiple seats atomically.

create extension if not exists pgcrypto;

create table if not exists public.reservation_seating_resources (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  parent_layout_item_id uuid not null,
  resource_type text not null default 'bar_seat',
  label text not null,
  seat_index integer not null check (seat_index > 0),
  capacity integer not null default 1 check (capacity = 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_layout_item_id, seat_index),
  unique (location_id, label)
);

create index if not exists reservation_seating_resources_location_idx
  on public.reservation_seating_resources(location_id, parent_layout_item_id, seat_index);

create table if not exists public.reservation_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  location_id uuid not null,
  seating_resource_id uuid not null references public.reservation_seating_resources(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (reservation_id, seating_resource_id)
);

create index if not exists reservation_resource_assignments_resource_idx
  on public.reservation_resource_assignments(seating_resource_id, reservation_id);
create index if not exists reservation_resource_assignments_reservation_idx
  on public.reservation_resource_assignments(reservation_id);

alter table public.reservation_seating_resources enable row level security;
alter table public.reservation_resource_assignments enable row level security;

-- These tables are operational internals. Server-side Reserve APIs use the service role.
-- Authenticated users receive no direct mutation policy; location access remains enforced
-- by the existing Reserve API authorization layer.

grant select on public.reservation_seating_resources to authenticated;
grant select on public.reservation_resource_assignments to authenticated;

create or replace function public.reserve_is_bar_type(value text)
returns boolean
language sql
immutable
as $$
  select replace(lower(coalesce(value, '')), ' ', '_') in
    ('bar', 'bar_seat', 'counter', 'counter_seat');
$$;

create or replace function public.reserve_sync_bar_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_count integer;
  seat_prefix text;
  i integer;
begin
  if not public.reserve_is_bar_type(new.item_type) then
    delete from public.reservation_seating_resources
      where parent_layout_item_id = new.id;
    return new;
  end if;

  seat_count := greatest(1, coalesce(new.capacity, 1));
  seat_prefix := coalesce(nullif(trim(new.item_name), ''), 'Bar');

  -- Preserve existing seat UUIDs where possible so active assignments remain stable.
  for i in 1..seat_count loop
    insert into public.reservation_seating_resources(
      location_id, parent_layout_item_id, resource_type, label, seat_index, capacity, is_active, updated_at
    ) values (
      new.location_id,
      new.id,
      case when replace(lower(coalesce(new.item_type,'')), ' ', '_') like 'counter%' then 'counter_seat' else 'bar_seat' end,
      seat_prefix || ' Seat ' || i,
      i,
      1,
      coalesce(new.is_active, true) and coalesce(lower(new.status), 'available') not in ('blocked','closed','maintenance','hidden','unavailable'),
      now()
    )
    on conflict (parent_layout_item_id, seat_index) do update set
      location_id = excluded.location_id,
      resource_type = excluded.resource_type,
      label = excluded.label,
      is_active = excluded.is_active,
      updated_at = now();
  end loop;

  update public.reservation_seating_resources
    set is_active = false, updated_at = now()
    where parent_layout_item_id = new.id and seat_index > seat_count;

  return new;
end;
$$;

drop trigger if exists reserve_sync_bar_seats_trigger on public.layout_items;
create trigger reserve_sync_bar_seats_trigger
after insert or update of item_type, item_name, capacity, is_active, status
on public.layout_items
for each row execute function public.reserve_sync_bar_seats();

-- Backfill existing bar/counter containers.
do $$
declare r record;
begin
  for r in select * from public.layout_items where public.reserve_is_bar_type(item_type)
  loop
    perform public.reserve_sync_bar_seats_from_row(r.id);
  end loop;
exception when undefined_function then
  -- The helper is created just below; backfill is repeated after creation.
  null;
end $$;

create or replace function public.reserve_sync_bar_seats_from_row(layout_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.layout_items%rowtype;
  seat_count integer;
  i integer;
begin
  select * into r from public.layout_items where id = layout_id;
  if not found or not public.reserve_is_bar_type(r.item_type) then return; end if;
  seat_count := greatest(1, coalesce(r.capacity,1));
  for i in 1..seat_count loop
    insert into public.reservation_seating_resources(location_id,parent_layout_item_id,resource_type,label,seat_index,capacity,is_active)
    values(r.location_id,r.id,case when replace(lower(coalesce(r.item_type,'')),' ','_') like 'counter%' then 'counter_seat' else 'bar_seat' end,
      coalesce(nullif(trim(r.item_name),''),'Bar') || ' Seat ' || i,i,1,coalesce(r.is_active,true))
    on conflict(parent_layout_item_id,seat_index) do update set
      label=excluded.label,is_active=excluded.is_active,updated_at=now();
  end loop;
end;
$$;

do $$
declare r record;
begin
  for r in select id from public.layout_items where public.reserve_is_bar_type(item_type)
  loop
    perform public.reserve_sync_bar_seats_from_row(r.id);
  end loop;
end $$;

create or replace function public.reserve_minutes(value text)
returns integer
language sql
immutable
as $$
  select coalesce(split_part(value, ':', 1)::integer,0) * 60 + coalesce(split_part(value, ':', 2)::integer,0);
$$;

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
  target_seat public.reservation_seating_resources%rowtype;
  parent_id uuid;
  parent_name text;
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
  party := greatest(1, coalesce(new.party_size,1));
  duration_minutes := greatest(1, coalesce(new.duration_minutes, new.turn_time_minutes, 90));
  reservation_start := public.reserve_minutes(coalesce(new.reservation_time::text,'00:00'));

  select s.* into target_seat
  from public.reservation_seating_resources s
  where s.location_id = new.location_id and lower(s.label) = lower(requested_label) and s.is_active
  limit 1;

  if found then
    parent_id := target_seat.parent_layout_item_id;
    start_index := target_seat.seat_index;
  else
    select l.id, l.item_name into parent_id, parent_name
    from public.layout_items l
    where l.location_id = new.location_id
      and public.reserve_is_bar_type(l.item_type)
      and lower(trim(l.item_name)) = lower(requested_label)
      and coalesce(l.is_active,true)
    limit 1;
    start_index := 1;
  end if;

  if parent_id is null then
    raise exception 'Bar seating resource was not found. Refresh the floor and try again.';
  end if;

  -- Prefer the stool the host tapped, then search outward for the first contiguous block.
  for candidate_start in start_index..greatest(start_index, 200) loop
    select array_agg(s.id order by s.seat_index), array_agg(s.label order by s.seat_index)
      into chosen, chosen_labels
    from public.reservation_seating_resources s
    where s.parent_layout_item_id = parent_id
      and s.is_active
      and s.seat_index between candidate_start and candidate_start + party - 1;

    if coalesce(array_length(chosen,1),0) <> party then
      chosen := null; chosen_labels := null;
      exit;
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

    if overlap_count = 0 then exit; end if;
    chosen := null; chosen_labels := null;
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

drop trigger if exists reserve_bar_assignments_trigger on public.location_reservations;
create trigger reserve_bar_assignments_trigger
before insert or update of bookable_item_id, bookable_item_name, bookable_item_type, status, reservation_date, reservation_time, duration_minutes, turn_time_minutes, party_size
on public.location_reservations
for each row execute function public.reserve_bar_assignments_before_write();

-- Release assignments if a reservation is physically deleted.
create or replace function public.reserve_release_assignments_after_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from public.reservation_resource_assignments where reservation_id = old.id;
  return old;
end $$;

drop trigger if exists reserve_release_assignments_delete_trigger on public.location_reservations;
create trigger reserve_release_assignments_delete_trigger
after delete on public.location_reservations
for each row execute function public.reserve_release_assignments_after_delete();
