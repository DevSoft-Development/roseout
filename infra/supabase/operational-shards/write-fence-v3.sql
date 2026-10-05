-- Operational shard hardening v3: local tenant write fences.
-- This table is intentionally local to each physical shard and is not part of the DR publication.

begin;

create table if not exists public.operational_location_write_fences (
  location_id uuid primary key,
  assignment_epoch bigint not null check (assignment_epoch > 0),
  frozen boolean not null default false,
  reason text,
  updated_at timestamptz not null default now()
);
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
begin
  if tg_table_name = 'locations' then
    v_location_id := coalesce(new.id, old.id);
  else
    v_location_id := coalesce(new.location_id, old.location_id);
  end if;

  if v_location_id is null then
    return coalesce(new, old);
  end if;

  -- Every write transaction participates in the location fence. The shared
  -- row lock is retained until commit. A rebalance freeze updates this same
  -- row, so it waits for already-running writes to drain before succeeding.
  insert into public.operational_location_write_fences(location_id,assignment_epoch,frozen)
  values (v_location_id, 1, false)
  on conflict (location_id) do nothing;

  select frozen into v_frozen
  from public.operational_location_write_fences
  where location_id = v_location_id
  for share;

  if coalesce(v_frozen, false) then
    -- A card flow that was already in flight before the fence may need to
    -- void its reserved tender after cancelling the external intent.
    if tg_table_name = 'pos_tenders'
       and tg_op = 'UPDATE'
       and old.status = 'initiated'
       and new.status = 'voided' then
      return new;
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
    'pos_checks',
    'pos_check_resources',
    'pos_orders',
    'pos_order_items',
    'pos_tenders',
    'pos_payments'
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
  2,
  '20261005_operational_location_write_fence_v2',
  'sha256:operational-location-write-fence-v2',
  '{"scope":"tenant_move_write_fence"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

commit;
