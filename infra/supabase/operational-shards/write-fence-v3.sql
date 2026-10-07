-- Operational shard hardening v3: local tenant write fences.
-- This table is intentionally local to each physical shard and is not part of the DR publication.

begin;

create table if not exists public.operational_shard_write_gate (
  id smallint primary key check (id = 1),
  frozen boolean not null default true,
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.operational_shard_write_gate alter column frozen set default true;
insert into public.operational_shard_write_gate(id,frozen,reason) values (1,true,'new-shard-standby')
on conflict (id) do nothing;
alter table public.operational_shard_write_gate enable row level security;
revoke all on table public.operational_shard_write_gate from anon, authenticated;
grant select, insert, update, delete on table public.operational_shard_write_gate to service_role;

create table if not exists public.operational_location_write_fences (
  location_id uuid primary key,
  assignment_epoch bigint not null check (assignment_epoch > 0),
  frozen boolean not null default false,
  reason text,
  bypass_token_hash text,
  bypass_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.operational_location_write_fences
  add column if not exists bypass_token_hash text;
alter table public.operational_location_write_fences
  add column if not exists bypass_expires_at timestamptz;
alter table public.operational_location_write_fences enable row level security;
revoke all on table public.operational_location_write_fences from anon, authenticated;
grant select, insert, update, delete on table public.operational_location_write_fences to service_role;

create or replace function public.enforce_operational_location_write_fence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_location_id uuid;
  v_frozen boolean;
  v_shard_frozen boolean;
  v_bypass_token_hash text;
  v_bypass_expires_at timestamptz;
  v_request_headers json;
  v_request_token text;
  v_bypass_allowed boolean := false;
  v_cleanup_allowed boolean := false;
begin
  if tg_table_name = 'locations' then
    v_location_id := coalesce(new.id, old.id);
  else
    v_location_id := coalesce(new.location_id, old.location_id);
  end if;

  if v_location_id is null then
    return coalesce(new, old);
  end if;

  v_cleanup_allowed := false;
  if tg_table_name = 'pos_tenders' and tg_op = 'UPDATE' then
    v_cleanup_allowed := old.status = 'initiated' and new.status = 'voided';
  end if;

  -- Every operational write also participates in a physical-shard gate.
  -- Freezing this singleton row waits for all currently writing transactions.
  select frozen into v_shard_frozen
  from public.operational_shard_write_gate
  where id = 1
  for share;

  if coalesce(v_shard_frozen, false) and not v_cleanup_allowed then
    raise exception 'operational_shard_writes_frozen';
  end if;

  -- Every write transaction participates in the location fence. The shared
  -- row lock is retained until commit. A rebalance freeze updates this same
  -- row, so it waits for already-running writes to drain before succeeding.
  insert into public.operational_location_write_fences(location_id,assignment_epoch,frozen)
  values (v_location_id, 1, false)
  on conflict (location_id) do nothing;

  select frozen,bypass_token_hash,bypass_expires_at
    into v_frozen,v_bypass_token_hash,v_bypass_expires_at
  from public.operational_location_write_fences
  where location_id = v_location_id
  for share;

  begin
    v_request_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_request_headers := null;
  end;
  v_request_token := coalesce(v_request_headers->>'x-theouthaven-rebalance-token', '');
  v_bypass_allowed :=
    v_request_token <> ''
    and v_bypass_token_hash is not null
    and v_bypass_expires_at is not null
    and v_bypass_expires_at > now()
    and encode(extensions.digest(v_request_token, 'sha256'), 'hex') = v_bypass_token_hash;

  if coalesce(v_frozen, false) then
    -- A card flow that was already in flight before the fence may need to
    -- void its reserved tender after cancelling the external intent.
    if v_cleanup_allowed or v_bypass_allowed then
      return coalesce(new, old);
    end if;
    raise exception 'operational_location_writes_frozen';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'locations',
    'location_reservations',
    'reserve_staff_profiles',
    'layout_items',
    'reservation_seating_resources',
    'reservation_resource_assignments',
    'pos_checks',
    'pos_check_resources',
    'pos_orders',
    'pos_order_items',
    'pos_tenders',
    'pos_payments',
    'pos_inventory_items',
    'pos_inventory_transactions',
    'pos_inventory_adjustments'
  ]
  loop
    execute format('drop trigger if exists operational_location_write_fence on public.%I', t);
    execute format(
      'create trigger operational_location_write_fence before insert or update or delete on public.%I for each row execute function public.enforce_operational_location_write_fence()',
      t
    );
  end loop;
end $$;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (
  3,
  '20261005_operational_location_write_fence_v3',
  'sha256:operational-location-write-fence-v3',
  '{"scope":"tenant_move_write_fence_with_maintenance_bypass"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (
  5,
  '20261005_operational_write_fence_standby_v5',
  'sha256:operational-write-fence-standby-v5',
  '{"scope":"standby_fail_closed_and_reservation_assignment_fence"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

commit;
