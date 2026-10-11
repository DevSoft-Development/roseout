-- Isolated simulation fixtures, intentionally NOT registered as POS hardware.
-- No publication of fake devices into active hardware assignments.
create table if not exists public.pos_hardware_simulated_devices (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null,
 slot integer not null check (slot between 1 and 10000),
 kind text not null check (kind in ('register','kitchen_printer','receipt_printer','waiter_handheld','network_hub','kds')),
 simulated_health text not null default 'ready' check (simulated_health in ('ready','offline')),
 last_seen_at timestamptz,
 scenario text not null default 'normal',
 incident_open boolean not null default false,
 incident_count integer not null default 0,
 recovery_count integer not null default 0,
 last_classification text not null default 'unknown',
 updated_at timestamptz not null default now(),
 unique(location_id,slot)
);
create index if not exists pos_hardware_simulated_devices_location_idx on public.pos_hardware_simulated_devices(location_id);
alter table public.pos_hardware_simulated_devices enable row level security;
revoke all on public.pos_hardware_simulated_devices from anon,authenticated;
grant select,insert,update,delete on public.pos_hardware_simulated_devices to service_role;
comment on table public.pos_hardware_simulated_devices is 'Admin QA fixtures only. Never join into production hardware assignments, incident outbox or payment flows.';
