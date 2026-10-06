-- ThePOSHaven global device registry.
-- Control-plane identity and assignment data stays outside operational order/check shards
-- so hardware can still be discovered and reassigned during a tenant shard incident.
-- toh:replicated-dml-reviewed

create extension if not exists pgcrypto;

create table if not exists public.pos_hardware_devices (
  id uuid primary key default gen_random_uuid(),
  hardware_catalog_id text not null,
  vendor text not null,
  model text not null,
  device_type text not null
    check (device_type in (
      'cashier_tablet',
      'payment_terminal',
      'receipt_printer',
      'kitchen_printer',
      'cash_drawer',
      'barcode_scanner',
      'network_hub',
      'network_bridge',
      'kitchen_display'
    )),
  serial_number text not null,
  provider text null,
  provider_device_id text null,
  lifecycle_status text not null default 'inventory'
    check (lifecycle_status in (
      'inventory',
      'provisioned',
      'assigned',
      'active',
      'replaced',
      'retired',
      'lost'
    )),
  health_status text not null default 'unknown'
    check (health_status in (
      'ready',
      'offline',
      'degraded',
      'paper_out',
      'cover_open',
      'error',
      'unknown'
    )),
  firmware_version text null,
  last_seen_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(vendor, serial_number)
);

create unique index if not exists pos_hardware_devices_provider_uidx
  on public.pos_hardware_devices(provider, provider_device_id)
  where provider is not null and provider_device_id is not null;

create index if not exists pos_hardware_devices_status_idx
  on public.pos_hardware_devices(lifecycle_status, device_type, updated_at desc);

create table if not exists public.pos_hardware_assignments (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.pos_hardware_devices(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete cascade,
  role text not null,
  station_key text not null default 'default',
  assignment_status text not null default 'active'
    check (assignment_status in ('active','replaced','unassigned')),
  replacement_for_device_id uuid null references public.pos_hardware_devices(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (assignment_status = 'active' and unassigned_at is null)
    or assignment_status <> 'active'
  )
);

create unique index if not exists pos_hardware_assignments_active_device_uidx
  on public.pos_hardware_assignments(device_id)
  where assignment_status = 'active';

create unique index if not exists pos_hardware_assignments_active_slot_uidx
  on public.pos_hardware_assignments(location_id, role, station_key)
  where assignment_status = 'active';

create index if not exists pos_hardware_assignments_location_idx
  on public.pos_hardware_assignments(location_id, assignment_status, role, station_key);

create or replace function public.pos_assign_hardware_device(
  p_device_id uuid,
  p_location_id uuid,
  p_role text,
  p_station_key text default 'default',
  p_replace_device_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_existing_device uuid;
  v_role text := nullif(btrim(coalesce(p_role,'')), '');
  v_station text := coalesce(nullif(btrim(coalesce(p_station_key,'')), ''), 'default');
begin
  if v_role is null then
    raise exception 'pos_hardware_role_required';
  end if;

  perform 1
  from public.pos_hardware_devices
  where id = p_device_id
    and lifecycle_status not in ('retired','lost')
  for update;

  if not found then
    raise exception 'pos_hardware_device_unavailable';
  end if;

  select device_id
  into v_existing_device
  from public.pos_hardware_assignments
  where location_id = p_location_id
    and role = v_role
    and station_key = v_station
    and assignment_status = 'active'
  for update;

  if v_existing_device is not null and v_existing_device <> p_device_id then
    if p_replace_device_id is null or p_replace_device_id <> v_existing_device then
      raise exception 'pos_hardware_slot_already_assigned';
    end if;

    update public.pos_hardware_assignments
      set assignment_status = 'replaced',
          unassigned_at = now(),
          updated_at = now()
    where device_id = v_existing_device
      and assignment_status = 'active';

    update public.pos_hardware_devices
      set lifecycle_status = 'replaced',
          updated_at = now()
    where id = v_existing_device;
  end if;

  update public.pos_hardware_assignments
    set assignment_status = 'unassigned',
        unassigned_at = now(),
        updated_at = now()
  where device_id = p_device_id
    and assignment_status = 'active';

  insert into public.pos_hardware_assignments (
    device_id,
    location_id,
    role,
    station_key,
    assignment_status,
    replacement_for_device_id,
    metadata
  ) values (
    p_device_id,
    p_location_id,
    v_role,
    v_station,
    'active',
    p_replace_device_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  update public.pos_hardware_devices
    set lifecycle_status = 'assigned',
        updated_at = now()
  where id = p_device_id;

  return v_assignment_id;
end;
$$;

create or replace function public.pos_record_hardware_heartbeat(
  p_device_id uuid,
  p_health_status text,
  p_firmware_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_health_status not in ('ready','offline','degraded','paper_out','cover_open','error','unknown') then
    raise exception 'pos_hardware_health_invalid';
  end if;

  update public.pos_hardware_devices
    set health_status = p_health_status,
        firmware_version = coalesce(nullif(btrim(coalesce(p_firmware_version,'')), ''), firmware_version),
        last_seen_at = now(),
        lifecycle_status = case
          when lifecycle_status = 'assigned' and p_health_status = 'ready' then 'active'
          else lifecycle_status
        end,
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
        updated_at = now()
  where id = p_device_id;

  if not found then
    raise exception 'pos_hardware_device_not_found';
  end if;
end;
$$;

alter table public.pos_hardware_devices enable row level security;
alter table public.pos_hardware_assignments enable row level security;

revoke all on table public.pos_hardware_devices from anon, authenticated;
revoke all on table public.pos_hardware_assignments from anon, authenticated;
revoke execute on function public.pos_assign_hardware_device(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.pos_record_hardware_heartbeat(uuid, text, text, jsonb) from public, anon, authenticated;

grant select, insert, update, delete on table public.pos_hardware_devices to service_role;
grant select, insert, update, delete on table public.pos_hardware_assignments to service_role;
grant execute on function public.pos_assign_hardware_device(uuid, uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.pos_record_hardware_heartbeat(uuid, text, text, jsonb) to service_role;
