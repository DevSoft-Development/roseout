-- Serialize the controlled Location Intelligence V2 pilot so overlapping AWS
-- signals cannot allocate the same remaining quota or exceed the 100-location cap.

create table if not exists public.location_intelligence_v2_pilot_leases (
  pilot_id text primary key,
  owner_token uuid,
  locked_until timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.location_intelligence_v2_pilot_leases enable row level security;

revoke all on table public.location_intelligence_v2_pilot_leases from public, anon, authenticated;
grant select, update on table public.location_intelligence_v2_pilot_leases to service_role;

insert into public.location_intelligence_v2_pilot_leases (pilot_id, locked_until)
values ('initial_100_v1', 'epoch'::timestamptz)
on conflict (pilot_id) do nothing;

create or replace function public.acquire_location_intelligence_v2_pilot_lease(
  p_pilot_id text,
  p_owner_token uuid,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.location_intelligence_v2_pilot_leases
  set owner_token = p_owner_token,
      locked_until = clock_timestamp() + make_interval(
        secs => greatest(60, least(coalesce(p_lease_seconds, 600), 1800))
      ),
      updated_at = clock_timestamp()
  where pilot_id = p_pilot_id
    and locked_until < clock_timestamp();

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.acquire_location_intelligence_v2_pilot_lease(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_location_intelligence_v2_pilot_lease(text, uuid, integer)
  to service_role;

create or replace function public.release_location_intelligence_v2_pilot_lease(
  p_pilot_id text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.location_intelligence_v2_pilot_leases
  set owner_token = null,
      locked_until = 'epoch'::timestamptz,
      updated_at = clock_timestamp()
  where pilot_id = p_pilot_id
    and owner_token = p_owner_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.release_location_intelligence_v2_pilot_lease(text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_location_intelligence_v2_pilot_lease(text, uuid)
  to service_role;
