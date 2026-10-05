-- Operational shard routing foundation.
-- Global identity/catalog data remains authoritative in the primary East/West DR pair.
-- Tenant operational data can be routed to independent Supabase projects by location.
-- Shard credentials are never stored in Postgres.

create table if not exists public.operational_shards (
  id text primary key
    check (id ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  display_name text not null,
  project_ref text null,
  region text null,
  status text not null default 'planned'
    check (status in ('planned','provisioning','active','draining','disabled','failed')),
  read_enabled boolean not null default false,
  write_enabled boolean not null default false,
  soft_location_target integer not null default 300
    check (soft_location_target between 1 and 500),
  hard_location_limit integer not null default 500
    check (hard_location_limit between soft_location_target and 1000),
  dedicated boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locations
  add column if not exists operational_shard_id text not null default 'primary';

create index if not exists locations_operational_shard_idx
  on public.locations(operational_shard_id, id);

create table if not exists public.location_shard_moves (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  source_shard_id text not null,
  target_shard_id text not null,
  status text not null default 'planned'
    check (status in (
      'planned',
      'copying',
      'verifying',
      'cutover_ready',
      'cutting_over',
      'completed',
      'rolling_back',
      'rolled_back',
      'failed'
    )),
  initiated_by uuid null,
  verification jsonb not null default '{}'::jsonb,
  failure_reason text null,
  started_at timestamptz null,
  cutover_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_shard_id <> target_shard_id)
);

create index if not exists location_shard_moves_location_idx
  on public.location_shard_moves(location_id, created_at desc);
create index if not exists location_shard_moves_status_idx
  on public.location_shard_moves(status, created_at);

alter table public.operational_shards enable row level security;
alter table public.location_shard_moves enable row level security;

revoke all on table public.operational_shards from anon, authenticated;
revoke all on table public.location_shard_moves from anon, authenticated;

grant select, insert, update, delete on table public.operational_shards to service_role;
grant select, insert, update, delete on table public.location_shard_moves to service_role;

comment on column public.locations.operational_shard_id is
  'Logical operational Supabase shard id. primary means the canonical East/West DR-backed project.';
comment on table public.operational_shards is
  'Non-secret shard registry. Runtime credentials live only in the centralized credential vault.';
comment on table public.location_shard_moves is
  'Auditable state machine for moving one location operationally between shards.';
