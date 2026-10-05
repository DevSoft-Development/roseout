-- Global operational shard routing hardening migration.
-- Idempotent on both authoritative East and global West DR.

begin;

alter table public.operational_shards
  add column if not exists dr_shard_id text,
  add column if not exists active_physical_shard_id text,
  add column if not exists routing_epoch bigint not null default 1,
  add column if not exists failover_state text not null default 'primary',
  add column if not exists replication_state text not null default 'initializing',
  add column if not exists schema_version bigint not null default 1,
  add column if not exists last_failover_at timestamptz,
  add column if not exists last_replication_check_at timestamptz;

alter table public.locations
  add column if not exists operational_shard_epoch bigint not null default 1,
  add column if not exists operational_writes_frozen boolean not null default false;

alter table public.location_shard_moves
  add column if not exists source_epoch bigint,
  add column if not exists target_epoch bigint,
  add column if not exists source_schema_version bigint,
  add column if not exists target_schema_version bigint,
  add column if not exists data_manifest jsonb not null default '{}'::jsonb;

update public.operational_shards
set dr_shard_id = coalesce(dr_shard_id, metadata->>'dr_shard_id'),
    active_physical_shard_id = coalesce(active_physical_shard_id, id),
    schema_version = greatest(schema_version, 1)
where id in ('shard-01','shard-02');

do $$
begin
  if not exists (select 1 from pg_constraint where conname='operational_shards_failover_state_check') then
    alter table public.operational_shards add constraint operational_shards_failover_state_check
      check (failover_state in ('primary','promoting_dr','dr','promoting_primary','degraded'));
  end if;
  if not exists (select 1 from pg_constraint where conname='operational_shards_replication_state_check') then
    alter table public.operational_shards add constraint operational_shards_replication_state_check
      check (replication_state in ('initializing','healthy','lagging','broken','disabled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='operational_shards_active_physical_check') then
    alter table public.operational_shards add constraint operational_shards_active_physical_check
      check (active_physical_shard_id is null or active_physical_shard_id = id or active_physical_shard_id = dr_shard_id);
  end if;
end $$;

create table if not exists public.operational_shard_failover_events (
  id uuid primary key default gen_random_uuid(),
  shard_id text not null,
  from_physical_shard_id text not null,
  to_physical_shard_id text not null,
  from_epoch bigint not null,
  to_epoch bigint not null,
  action text not null check (action in ('promote_dr','failback_primary','abort')),
  status text not null default 'planned' check (status in ('planned','validating','cutover','completed','failed','aborted')),
  replication_lag_bytes bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.operational_shard_migration_ledger (
  physical_shard_id text not null,
  version bigint not null,
  migration_key text not null,
  checksum text not null,
  applied_at timestamptz not null,
  verified_at timestamptz not null default now(),
  primary key (physical_shard_id, version)
);

create index if not exists operational_shards_active_physical_idx on public.operational_shards(active_physical_shard_id);
create index if not exists operational_shard_failover_events_shard_idx on public.operational_shard_failover_events(shard_id, created_at desc);
create index if not exists operational_shard_migration_ledger_version_idx on public.operational_shard_migration_ledger(version, physical_shard_id);
create index if not exists locations_operational_routing_epoch_idx on public.locations(operational_shard_id, operational_shard_epoch, id);

alter table public.operational_shard_failover_events enable row level security;
alter table public.operational_shard_migration_ledger enable row level security;
revoke all on table public.operational_shard_failover_events from anon, authenticated;
revoke all on table public.operational_shard_migration_ledger from anon, authenticated;
grant select, insert, update, delete on table public.operational_shard_failover_events to service_role;
grant select, insert, update, delete on table public.operational_shard_migration_ledger to service_role;

commit;


-- Keep the authoritative global VA->OR logical-replication publication complete
-- when this migration runs on the source project. The West DR project does not
-- own this publication, so this block is intentionally conditional.
do $$
begin
  if exists (select 1 from pg_publication where pubname='theouthaven_dr_publication') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname='theouthaven_dr_publication'
        and schemaname='public'
        and tablename='operational_shard_failover_events'
    ) then
      alter publication theouthaven_dr_publication add table public.operational_shard_failover_events;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname='theouthaven_dr_publication'
        and schemaname='public'
        and tablename='operational_shard_migration_ledger'
    ) then
      alter publication theouthaven_dr_publication add table public.operational_shard_migration_ledger;
    end if;
  end if;
end $$;
