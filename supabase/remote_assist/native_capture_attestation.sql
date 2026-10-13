-- Native screen-capture proof is device-authenticated and short lived.
-- This table is intentionally inaccessible to public API roles.
create table if not exists public.pos_remote_assist_capture_attestations (
 session_id uuid primary key references public.pos_remote_assist_sessions(id) on delete cascade,
 location_id uuid not null,
 device_id uuid not null,
 approved_at timestamptz not null,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 attestation_id uuid not null unique,
 check (expires_at > approved_at),
 check (expires_at <= approved_at + interval '2 minutes')
);
alter table public.pos_remote_assist_capture_attestations enable row level security;
revoke all on public.pos_remote_assist_capture_attestations from public,anon,authenticated,service_role;
-- No insert or read policies: trusted native attestation adapter required.
