-- Operational shard hardening v2.
-- Applied live to shard-01, shard-01-dr, shard-02, and shard-02-dr.
-- DDL is intentionally separate from data replication because PostgreSQL logical replication does not replicate DDL.

begin;

create table if not exists public.operational_schema_versions (
  version bigint primary key,
  migration_key text not null unique,
  checksum text not null,
  applied_at timestamptz not null default now(),
  applied_by text not null default 'theposhaven',
  metadata jsonb not null default '{}'::jsonb
);
alter table public.operational_schema_versions enable row level security;
revoke all on table public.operational_schema_versions from anon, authenticated;
grant select, insert, update, delete on table public.operational_schema_versions to service_role;

create index if not exists pos_check_resources_layout_item_fk_idx
  on public.pos_check_resources(layout_item_id) where layout_item_id is not null;
create index if not exists pos_check_resources_seating_resource_fk_idx
  on public.pos_check_resources(seating_resource_id) where seating_resource_id is not null;
create index if not exists pos_checks_server_staff_profile_fk_idx
  on public.pos_checks(server_staff_profile_id) where server_staff_profile_id is not null;
create index if not exists pos_orders_server_staff_profile_fk_idx
  on public.pos_orders(server_staff_profile_id) where server_staff_profile_id is not null;
create index if not exists pos_tenders_staff_profile_fk_idx
  on public.pos_tenders(staff_profile_id) where staff_profile_id is not null;
create index if not exists reservation_seating_resources_parent_layout_item_fk_idx
  on public.reservation_seating_resources(parent_layout_item_id) where parent_layout_item_id is not null;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (
  1,
  '20261005_operational_shard_hardening_v1',
  'sha256:operational-shard-hardening-v1',
  '{"scope":"fk_indexes_and_schema_ledger"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

commit;

-- Run on primary shards only.
do $$
begin
  if not exists (select 1 from pg_publication where pubname='toh_operational_dr') then
    execute 'create publication toh_operational_dr for table
      public.locations,
      public.location_reservations,
      public.reserve_staff_profiles,
      public.layout_items,
      public.reservation_seating_resources,
      public.pos_checks,
      public.pos_check_resources,
      public.pos_orders,
      public.pos_order_items,
      public.pos_tenders,
      public.pos_payments';
  end if;
end $$;
