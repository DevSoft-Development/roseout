-- Server assignment and secure shared-device staff sessions for Reserve Host View.

alter table public.location_reservations
  add column if not exists server_staff_profile_id uuid null references public.reserve_staff_profiles(id) on delete set null;

create index if not exists location_reservations_server_service_idx
  on public.location_reservations(location_id, reservation_date, server_staff_profile_id)
  where server_staff_profile_id is not null;

create table if not exists public.reserve_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  staff_profile_id uuid not null references public.reserve_staff_profiles(id) on delete cascade,
  token_hash text not null unique,
  device_label text null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists reserve_staff_sessions_active_idx
  on public.reserve_staff_sessions(location_id, expires_at)
  where revoked_at is null;

alter table public.reserve_staff_sessions enable row level security;
revoke all on table public.reserve_staff_sessions from anon, authenticated;
grant select, insert, update, delete on table public.reserve_staff_sessions to service_role;

create or replace function public.reserve_assign_server(
  p_reservation_id uuid,
  p_location_id uuid,
  p_server_staff_profile_id uuid,
  p_actor_staff_profile_id uuid default null
) returns public.location_reservations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_res public.location_reservations%rowtype;
  v_before jsonb;
begin
  select * into v_res
    from public.location_reservations
   where id = p_reservation_id and location_id = p_location_id
   for update;
  if not found then raise exception 'Reservation not found'; end if;
  if not exists (
    select 1 from public.reserve_staff_profiles
     where id = p_server_staff_profile_id and location_id = p_location_id and is_active = true
  ) then raise exception 'Server is not active for this location'; end if;

  v_before := to_jsonb(v_res);
  update public.location_reservations
     set server_staff_profile_id = p_server_staff_profile_id,
         updated_at = now()
   where id = p_reservation_id
   returning * into v_res;

  insert into public.reserve_service_events(
    location_id,reservation_id,staff_profile_id,event_type,before_state,after_state,metadata
  ) values (
    p_location_id,p_reservation_id,p_actor_staff_profile_id,'reservation.server_assigned',
    v_before,to_jsonb(v_res),jsonb_build_object('server_staff_profile_id',p_server_staff_profile_id)
  );
  return v_res;
end;
$$;

revoke all on function public.reserve_assign_server(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_assign_server(uuid,uuid,uuid,uuid) to service_role;
