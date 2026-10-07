-- Device-authenticated ThePOSHaven cashier API credentials.
-- Global control plane: credentials survive operational shard failover.
-- toh:replicated-dml-reviewed

create table if not exists public.pos_device_claim_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.pos_hardware_devices(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pos_device_claim_codes_device_idx
  on public.pos_device_claim_codes(device_id,expires_at desc);

create table if not exists public.pos_device_api_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.pos_hardware_devices(id) on delete cascade,
  installation_id text not null,
  credential_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(device_id,installation_id)
);

create index if not exists pos_device_api_credentials_active_idx
  on public.pos_device_api_credentials(device_id,revoked_at);

alter table public.pos_device_claim_codes enable row level security;
alter table public.pos_device_api_credentials enable row level security;
revoke all on table public.pos_device_claim_codes from public,anon,authenticated;
revoke all on table public.pos_device_api_credentials from public,anon,authenticated;
grant select,insert,update,delete on table public.pos_device_claim_codes to service_role;
grant select,insert,update,delete on table public.pos_device_api_credentials to service_role;
