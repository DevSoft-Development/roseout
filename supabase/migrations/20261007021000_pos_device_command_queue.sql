-- Global POS device authentication and command queue.
-- Kept outside operational shards so paid-order dispatch survives tenant shard failover.
-- toh:replicated-dml-reviewed

create extension if not exists pgcrypto;

create table if not exists public.pos_device_claim_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.pos_hardware_devices(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_device_claim_codes_device_idx
  on public.pos_device_claim_codes(device_id, expires_at desc);

create table if not exists public.pos_device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique references public.pos_hardware_devices(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  installation_id text not null,
  credential_hash text not null unique,
  status text not null default 'active'
    check (status in ('active','revoked')),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  rotated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_device_credentials_location_idx
  on public.pos_device_credentials(location_id, status, updated_at desc);

create table if not exists public.pos_location_commands (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  command_type text not null
    check (command_type in (
      'online_order_received',
      'online_order_status_changed',
      'device_config_refresh'
    )),
  source_type text,
  source_id text,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','leased','acknowledged','dead_letter')),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  claimed_by_device_id uuid references public.pos_hardware_devices(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  acknowledged_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, dedupe_key)
);

create index if not exists pos_location_commands_delivery_idx
  on public.pos_location_commands(location_id, status, available_at, created_at)
  where status in ('pending','leased');

alter table public.pos_device_claim_codes enable row level security;
alter table public.pos_device_credentials enable row level security;
alter table public.pos_location_commands enable row level security;

revoke all on table public.pos_device_claim_codes from public, anon, authenticated;
revoke all on table public.pos_device_credentials from public, anon, authenticated;
revoke all on table public.pos_location_commands from public, anon, authenticated;

grant select, insert, update, delete on table public.pos_device_claim_codes to service_role;
grant select, insert, update, delete on table public.pos_device_credentials to service_role;
grant select, insert, update, delete on table public.pos_location_commands to service_role;
