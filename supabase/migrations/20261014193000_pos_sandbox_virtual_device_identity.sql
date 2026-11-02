-- Separate sandbox identity; never register a physical POS hardware device.
create table if not exists public.pos_sandbox_virtual_devices (
 id text primary key check (id ~ '^sandbox-[0-9a-f]{32}$'),
 location_id uuid not null references public.locations(id) on delete cascade,
 credential_sha256 text not null check (credential_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'active' check(status in ('active','revoked')),
 purpose text not null default 'pos_checkout_certification' check(purpose='pos_checkout_certification'),
 expires_at timestamptz not null,
 issued_by uuid not null,
 issued_at timestamptz not null default now(),
 revoked_by uuid,
 revoked_at timestamptz,
 constraint sandbox_virtual_device_ttl check (expires_at <= issued_at + interval '2 hours')
);
create index if not exists pos_sandbox_virtual_devices_location_idx on public.pos_sandbox_virtual_devices(location_id,status,expires_at);
alter table public.pos_sandbox_virtual_devices enable row level security;
revoke all on public.pos_sandbox_virtual_devices from public, anon, authenticated;
grant select,insert,update on public.pos_sandbox_virtual_devices to service_role;
comment on table public.pos_sandbox_virtual_devices is 'Short-lived demo-only software identities. Not hardware certification, not physical reader authorization.';
