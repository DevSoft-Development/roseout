-- Persistent, revocable authorization for shared Reserve front-desk devices.
-- A device authorization does not identify a staff member or grant Business dashboard access.
-- Staff actions still require an individual Reserve staff PIN/session.

create table if not exists public.reserve_authorized_devices (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  token_hash text not null unique,
  label text not null default 'Reserve device',
  authorized_by_user_id uuid null,
  status text not null default 'active' check (status in ('active','revoked')),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reserve_authorized_devices_location_active_idx
  on public.reserve_authorized_devices(location_id, status, created_at desc);

alter table public.reserve_authorized_devices enable row level security;
revoke all on table public.reserve_authorized_devices from anon, authenticated;
grant select, insert, update, delete on table public.reserve_authorized_devices to service_role;
