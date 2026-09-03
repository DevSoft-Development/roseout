-- TheOutHaven Reserve enterprise host operations foundation.
-- Additive, server-controlled schema for staff quick-switch, shifts/sections,
-- pacing, service activity, background outbox, and atomic table assignment.

create extension if not exists pgcrypto;

create table if not exists public.reserve_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  team_member_id uuid null,
  display_name text not null,
  role text not null default 'server',
  pin_hash text null,
  pin_length smallint not null default 4 check (pin_length in (4, 5, 6)),
  is_active boolean not null default true,
  can_quick_switch boolean not null default true,
  failed_pin_attempts integer not null default 0,
  pin_locked_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, team_member_id)
);

create index if not exists reserve_staff_profiles_location_idx
  on public.reserve_staff_profiles(location_id, is_active);

create table if not exists public.reserve_service_sections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  name text not null,
  area_key text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, name)
);

create table if not exists public.reserve_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  staff_profile_id uuid not null references public.reserve_staff_profiles(id) on delete cascade,
  section_id uuid null references public.reserve_service_sections(id) on delete set null,
  service_date date not null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  status text not null default 'active' check (status in ('scheduled','active','break','cut','clocked_out','unavailable')),
  max_tables integer null,
  max_covers integer null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reserve_staff_shifts_location_date_idx
  on public.reserve_staff_shifts(location_id, service_date, status);

create table if not exists public.reserve_service_settings (
  location_id uuid primary key,
  assignment_mode text not null default 'balanced' check (assignment_mode in ('manual','rotation','balanced')),
  include_bar_in_auto_assignment boolean not null default true,
  max_covers_15m integer null,
  max_covers_30m integer null,
  walkin_reserve_covers integer not null default 0,
  late_grace_minutes integer not null default 15,
  floor_focus_default boolean not null default false,
  offline_snapshot_minutes integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reserve_service_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  reservation_id uuid null,
  staff_profile_id uuid null references public.reserve_staff_profiles(id) on delete set null,
  event_type text not null,
  resource_label text null,
  before_state jsonb null,
  after_state jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reserve_service_events_location_created_idx
  on public.reserve_service_events(location_id, created_at desc);
create index if not exists reserve_service_events_reservation_idx
  on public.reserve_service_events(reservation_id, created_at desc);

create table if not exists public.reserve_background_outbox (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  reservation_id uuid null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reserve_background_outbox_pending_idx
  on public.reserve_background_outbox(status, available_at)
  where status in ('pending','failed');

alter table public.reserve_staff_profiles enable row level security;
alter table public.reserve_service_sections enable row level security;
alter table public.reserve_staff_shifts enable row level security;
alter table public.reserve_service_settings enable row level security;
alter table public.reserve_service_events enable row level security;
alter table public.reserve_background_outbox enable row level security;

revoke all on table public.reserve_staff_profiles from anon, authenticated;
revoke all on table public.reserve_service_sections from anon, authenticated;
revoke all on table public.reserve_staff_shifts from anon, authenticated;
revoke all on table public.reserve_service_settings from anon, authenticated;
revoke all on table public.reserve_service_events from anon, authenticated;
revoke all on table public.reserve_background_outbox from anon, authenticated;

grant select, insert, update, delete on table public.reserve_staff_profiles to service_role;
grant select, insert, update, delete on table public.reserve_service_sections to service_role;
grant select, insert, update, delete on table public.reserve_staff_shifts to service_role;
grant select, insert, update, delete on table public.reserve_service_settings to service_role;
grant select, insert, update, delete on table public.reserve_service_events to service_role;
grant select, insert, update, delete on table public.reserve_background_outbox to service_role;

create or replace function public.reserve_set_staff_pin(
  p_staff_profile_id uuid,
  p_pin text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;
  if p_pin in ('0000','1111','1234','4321','2222','3333','4444','5555','6666','7777','8888','9999') then
    raise exception 'Choose a less predictable PIN';
  end if;
  update public.reserve_staff_profiles
     set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
         pin_length = length(p_pin),
         failed_pin_attempts = 0,
         pin_locked_until = null,
         updated_at = now()
   where id = p_staff_profile_id;
end;
$$;

revoke all on function public.reserve_set_staff_pin(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_set_staff_pin(uuid,text) to service_role;

create or replace function public.reserve_verify_staff_pin(
  p_staff_profile_id uuid,
  p_pin text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.reserve_staff_profiles%rowtype;
  v_ok boolean := false;
begin
  select * into v_row from public.reserve_staff_profiles where id = p_staff_profile_id for update;
  if not found or not v_row.is_active or not v_row.can_quick_switch then return false; end if;
  if v_row.pin_locked_until is not null and v_row.pin_locked_until > now() then return false; end if;
  v_ok := v_row.pin_hash is not null and crypt(p_pin, v_row.pin_hash) = v_row.pin_hash;
  if v_ok then
    update public.reserve_staff_profiles
       set failed_pin_attempts = 0, pin_locked_until = null, updated_at = now()
     where id = p_staff_profile_id;
  else
    update public.reserve_staff_profiles
       set failed_pin_attempts = failed_pin_attempts + 1,
           pin_locked_until = case when failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' else pin_locked_until end,
           updated_at = now()
     where id = p_staff_profile_id;
  end if;
  return v_ok;
end;
$$;

revoke all on function public.reserve_verify_staff_pin(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_verify_staff_pin(uuid,text) to service_role;

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
begin
  select * into v_res
    from public.location_reservations
   where id = p_reservation_id and location_id = p_location_id
   for update;
  if not found then raise exception 'Reservation not found'; end if;

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
     and r.status in ('pending','confirmed','checked_in','waiting','arrived','seated')
     and (
       (extract(hour from r.reservation_time::time) * 60 + extract(minute from r.reservation_time::time))
         < (extract(hour from v_res.reservation_time::time) * 60 + extract(minute from v_res.reservation_time::time)) + coalesce(v_res.duration_minutes,v_res.turn_time_minutes,90)
       and
       (extract(hour from v_res.reservation_time::time) * 60 + extract(minute from v_res.reservation_time::time))
         < (extract(hour from r.reservation_time::time) * 60 + extract(minute from r.reservation_time::time)) + coalesce(r.duration_minutes,r.turn_time_minutes,90)
     );

  if v_conflict_count > 0 and p_override_reason is null then
    raise exception 'That table was just assigned or conflicts with another reservation';
  end if;

  v_old := to_jsonb(v_res);
  update public.location_reservations
     set bookable_item_id = p_resource_id,
         bookable_item_name = p_resource_label,
         bookable_item_type = coalesce(nullif(p_resource_type,''),'table'),
         status = case when p_seat_after_assign and v_res.status in ('confirmed','checked_in','waiting','arrived') then 'seated' else v_res.status end,
         checked_in_at = case when p_seat_after_assign and v_res.status = 'confirmed' then coalesce(v_res.checked_in_at,v_now) else v_res.checked_in_at end,
         arrived_at = case when p_seat_after_assign and v_res.status = 'confirmed' then coalesce(v_res.arrived_at,v_now) else v_res.arrived_at end,
         seated_at = case when p_seat_after_assign and v_res.status in ('confirmed','checked_in','waiting','arrived') then coalesce(v_res.seated_at,v_now) else v_res.seated_at end,
         updated_at = v_now
   where id = p_reservation_id
   returning * into v_res;

  insert into public.reserve_service_events(location_id,reservation_id,staff_profile_id,event_type,resource_label,before_state,after_state,metadata)
  values (p_location_id,p_reservation_id,p_staff_profile_id,
          case when p_override_reason is null then 'reservation.resource_assigned' else 'reservation.resource_override' end,
          p_resource_label,v_old,to_jsonb(v_res),jsonb_build_object('override_reason',p_override_reason));

  insert into public.reserve_background_outbox(location_id,reservation_id,event_type,payload)
  values (p_location_id,p_reservation_id,'reservation.seated',jsonb_build_object('resource_label',p_resource_label,'staff_profile_id',p_staff_profile_id));

  return v_res;
end;
$$;

revoke all on function public.reserve_assign_resource_atomic(uuid,uuid,uuid,text,text,integer,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_assign_resource_atomic(uuid,uuid,uuid,text,text,integer,boolean,uuid,text) to service_role;

-- Existing reservation tables are already used by Realtime in production. These new
-- service tables remain server-only and are intentionally not added to the publication.
