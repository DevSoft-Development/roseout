-- Primary operational placement fence.
-- Adds a tenant-scoped database write fence to the global primary operational tables
-- so initial placement can drain current writes before copying a tenant into a shard.
-- toh:replicated-dml-reviewed


create table if not exists public.primary_location_write_fences (
  location_id uuid primary key references public.locations(id) on delete cascade,
  assignment_epoch bigint not null check (assignment_epoch > 0),
  frozen boolean not null default false,
  reason text,
  updated_at timestamptz not null default now()
);

alter table public.primary_location_write_fences enable row level security;
revoke all on table public.primary_location_write_fences from anon, authenticated;
grant select, insert, update, delete on table public.primary_location_write_fences to service_role;

create or replace function public.enforce_primary_location_write_fence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_location_id uuid;
  v_frozen boolean;
  v_cleanup_allowed boolean := false;
begin
  if tg_op = 'DELETE' then
    v_location_id := old.location_id;
  else
    v_location_id := new.location_id;
  end if;
  if v_location_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- A card flow that was already outside Postgres when a placement freeze
  -- started must still be able to void its reserved tender after cancellation.
  if tg_table_name = 'pos_tenders' and tg_op = 'UPDATE' then
    v_cleanup_allowed := old.status = 'initiated' and new.status = 'voided';
  end if;

  -- Every primary operational write takes a shared lock on the tenant fence
  -- row for the lifetime of the transaction. Freezing that same row therefore
  -- waits for already-running writes to commit before the freeze succeeds.
  insert into public.primary_location_write_fences(location_id,assignment_epoch,frozen)
  values (
    v_location_id,
    coalesce((select operational_shard_epoch from public.locations where id=v_location_id), 1),
    false
  )
  on conflict (location_id) do nothing;

  select frozen into v_frozen
  from public.primary_location_write_fences
  where location_id = v_location_id
  for share;

  if coalesce(v_frozen, false) and not v_cleanup_allowed then
    raise exception 'primary_location_writes_frozen';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$;

do $$
declare
  t text;
begin
  foreach t in array array[
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
    'pos_payments'
  ]
  loop
    execute format('drop trigger if exists primary_location_write_fence on public.%I', t);
    execute format(
      'create trigger primary_location_write_fence before insert or update or delete on public.%I for each row execute function public.enforce_primary_location_write_fence()',
      t
    );
  end loop;
end $$;

