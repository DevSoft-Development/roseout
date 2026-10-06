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

create table if not exists public.reservation_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  location_id uuid not null,
  seating_resource_id uuid not null references public.reservation_seating_resources(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (reservation_id, seating_resource_id)
);
alter table public.reservation_resource_assignments enable row level security;
revoke all on table public.reservation_resource_assignments from PUBLIC, anon, authenticated;
grant select, insert, update, delete on table public.reservation_resource_assignments to service_role;
create index if not exists reservation_resource_assignments_resource_idx
  on public.reservation_resource_assignments(seating_resource_id, reservation_id);
create index if not exists reservation_resource_assignments_reservation_idx
  on public.reservation_resource_assignments(reservation_id);
create index if not exists reservation_resource_assignments_location_idx
  on public.reservation_resource_assignments(location_id);

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

alter table public.pos_tenders
  add column if not exists provider_call_lease_expires_at timestamptz;

create index if not exists pos_tenders_active_card_lease_idx
  on public.pos_tenders(provider_call_lease_expires_at, location_id)
  where tender_type='card' and status='initiated';

create or replace function public.pos_expire_stale_card_tenders(
  p_location_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $poslease$
declare
  v_expired integer;
begin
  update public.pos_tenders t
     set status='voided',
         voided_at=coalesce(t.voided_at, now()),
         provider_call_lease_expires_at=null,
         metadata=coalesce(t.metadata,'{}'::jsonb) || jsonb_build_object(
           'auto_void_reason','provider_call_lease_expired',
           'auto_voided_at',now()
         ),
         updated_at=now()
   where t.tender_type='card'
     and t.status='initiated'
     and (p_location_id is null or t.location_id=p_location_id)
     and not exists (
       select 1 from public.pos_payments p where p.tender_id=t.id
     )
     and coalesce(t.provider_call_lease_expires_at, t.created_at + interval '2 minutes') <= now();

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$poslease$;

revoke all on function public.pos_expire_stale_card_tenders(uuid) from public, anon, authenticated;
grant execute on function public.pos_expire_stale_card_tenders(uuid) to service_role;

create or replace function public.pos_begin_card_tender(
  p_location_id uuid,
  p_check_id uuid,
  p_tip_cents integer default 0,
  p_staff_profile_id uuid default null
)
returns table (
  tender_id uuid,
  tender_number integer,
  amount_cents integer,
  tip_cents integer,
  charge_total_cents integer,
  currency text
)
language plpgsql
security invoker
set search_path = public
as $posbegin$
declare
  v_check public.pos_checks%rowtype;
  v_net_paid integer;
  v_remaining integer;
  v_tender_number integer;
  v_tender_id uuid;
begin
  if coalesce(p_tip_cents, 0) < 0 then
    raise exception 'invalid_pos_tip_amount';
  end if;

  perform public.pos_expire_stale_card_tenders(p_location_id);

  select *
    into v_check
    from public.pos_checks
   where id = p_check_id
     and location_id = p_location_id
   for update;

  if not found then
    raise exception 'pos_check_not_found';
  end if;

  if v_check.status not in ('open', 'held') then
    raise exception 'pos_check_not_payable';
  end if;

  if exists (
    select 1
      from public.pos_tenders
     where check_id = p_check_id
       and location_id = p_location_id
       and tender_type = 'card'
       and status = 'initiated'
  ) then
    raise exception 'pos_payment_in_progress';
  end if;

  select coalesce(sum(greatest(0, amount_cents - amount_refunded_cents)), 0)
    into v_net_paid
    from public.pos_tenders
   where check_id = p_check_id
     and location_id = p_location_id
     and status in ('completed', 'partially_refunded', 'refunded');

  v_remaining := greatest(0, v_check.total_cents - v_net_paid);
  if v_remaining <= 0 then
    raise exception 'pos_check_already_paid';
  end if;

  select coalesce(max(tender_number), 0) + 1
    into v_tender_number
    from public.pos_tenders
   where check_id = p_check_id;

  insert into public.pos_tenders (
    location_id,
    check_id,
    staff_profile_id,
    tender_number,
    tender_type,
    status,
    amount_cents,
    tip_cents,
    provider_call_lease_expires_at
  )
  values (
    p_location_id,
    p_check_id,
    p_staff_profile_id,
    v_tender_number,
    'card',
    'initiated',
    v_remaining,
    coalesce(p_tip_cents, 0),
    now() + interval '2 minutes'
  )
  returning id into v_tender_id;

  return query
  select
    v_tender_id,
    v_tender_number,
    v_remaining,
    coalesce(p_tip_cents, 0),
    v_remaining + coalesce(p_tip_cents, 0),
    v_check.currency;
end;
$posbegin$;

revoke all on function public.pos_begin_card_tender(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.pos_begin_card_tender(uuid, uuid, integer, uuid) to service_role;
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

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (
  4,
  '20261005_reservation_resource_assignments_v4',
  'sha256:reservation-resource-assignments-v4',
  '{"scope":"reservation_seat_assignment_sharding"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (
  6,
  '20261005_pos_provider_call_lease_v6',
  'sha256:pos-provider-call-lease-v6',
  '{"scope":"card_provider_call_lease_and_stale_tender_expiry"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

commit;

-- Publication membership is idempotent. The local publication on a DR project
-- is harmless; subscriptions always point to the matching primary project.
do $$
begin
  if not exists (select 1 from pg_publication where pubname='toh_operational_dr') then
    execute 'create publication toh_operational_dr for table public.locations';
  end if;
end $$;

alter publication toh_operational_dr set table
  public.locations,
  public.location_reservations,
  public.reserve_staff_profiles,
  public.layout_items,
  public.reservation_seating_resources,
  public.reservation_resource_assignments,
  public.pos_checks,
  public.pos_check_resources,
  public.pos_orders,
  public.pos_order_items,
  public.pos_tenders,
  public.pos_payments;
