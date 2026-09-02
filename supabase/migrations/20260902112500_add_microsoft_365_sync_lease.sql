alter table public.microsoft_365_connections
  add column if not exists sync_lease_token uuid,
  add column if not exists sync_lease_expires_at timestamptz;

create index if not exists microsoft_365_connections_sync_lease_idx
  on public.microsoft_365_connections(sync_lease_expires_at)
  where sync_lease_token is not null;

comment on column public.microsoft_365_connections.sync_lease_token is
  'Opaque owner token for the distributed Microsoft 365 workspace sync lease.';
comment on column public.microsoft_365_connections.sync_lease_expires_at is
  'Expiration for the distributed Microsoft 365 workspace sync lease. A new runner may reclaim only after this timestamp.';
