-- Explicit tenant/device bindings; no access grants until trusted backend is wired.
create table if not exists public.pos_remote_assist_authorized_technicians(
 location_id uuid not null,
 device_id uuid not null,
 technician_id uuid not null,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 primary key(location_id,device_id,technician_id)
);
alter table public.pos_remote_assist_authorized_technicians enable row level security;
revoke all on public.pos_remote_assist_authorized_technicians from public,anon,authenticated,service_role,pos_assist_backend;
create index if not exists pos_assist_authorized_technicians_expiry
 on public.pos_remote_assist_authorized_technicians(expires_at)
 where revoked_at is null;
-- No RLS policies: only future authenticated provisioning service may manage bindings.
