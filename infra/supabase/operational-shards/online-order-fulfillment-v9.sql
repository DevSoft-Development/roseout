-- ThePOSHaven online order fulfillment v9.
-- Durable device-claimable dispatch queue for paid website/QR/kiosk orders.

begin;

create table if not exists public.pos_online_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  online_order_id uuid not null references public.pos_online_orders(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','claimed','completed','failed')),
  claimed_device_id uuid,
  claimed_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(online_order_id)
);

create index if not exists pos_online_order_dispatches_queue_idx
  on public.pos_online_order_dispatches(location_id,status,created_at)
  where status in ('queued','failed');

alter table public.pos_online_order_dispatches enable row level security;
revoke all on table public.pos_online_order_dispatches from public,anon,authenticated;
grant select,insert,update,delete on table public.pos_online_order_dispatches to service_role;

create or replace function public.pos_claim_online_order_dispatch(
  p_location_id uuid,
  p_device_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.pos_online_order_dispatches
   where location_id=p_location_id
     and status in ('queued','failed')
     and attempts < 10
   order by created_at asc
   for update skip locked
   limit 1;

  if v_id is null then return null; end if;

  update public.pos_online_order_dispatches
     set status='claimed',
         claimed_device_id=p_device_id,
         claimed_at=now(),
         attempts=attempts+1,
         last_error=null,
         updated_at=now()
   where id=v_id;
  return v_id;
end;
$$;

create or replace function public.pos_finish_online_order_dispatch(
  p_location_id uuid,
  p_dispatch_id uuid,
  p_device_id uuid,
  p_success boolean,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path=public
as $$
begin
  update public.pos_online_order_dispatches
     set status=case when p_success then 'completed' else 'failed' end,
         completed_at=case when p_success then now() else null end,
         last_error=case when p_success then null else left(coalesce(p_error,'unknown'),500) end,
         metadata=metadata||coalesce(p_metadata,'{}'::jsonb),
         updated_at=now()
   where id=p_dispatch_id
     and location_id=p_location_id
     and status='claimed'
     and claimed_device_id=p_device_id;
  if not found then raise exception 'online_order_dispatch_not_claimed'; end if;
end;
$$;

revoke all on function public.pos_claim_online_order_dispatch(uuid,uuid) from public,anon,authenticated;
revoke all on function public.pos_finish_online_order_dispatch(uuid,uuid,uuid,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.pos_claim_online_order_dispatch(uuid,uuid) to service_role;
grant execute on function public.pos_finish_online_order_dispatch(uuid,uuid,uuid,boolean,text,jsonb) to service_role;

-- Make paid-order dispatch durable and transactionally coupled to payment finalization.
create or replace function public.pos_enqueue_online_order_dispatch()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.provider_payment_intent_id is not null
     and new.status in ('received','accepted')
     and (
       old.provider_payment_intent_id is distinct from new.provider_payment_intent_id
       or old.status is distinct from new.status
     ) then
    insert into public.pos_online_order_dispatches(location_id,online_order_id,status)
    values(new.location_id,new.id,'queued')
    on conflict(online_order_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists pos_online_order_dispatch_after_payment on public.pos_online_orders;
create trigger pos_online_order_dispatch_after_payment
after update on public.pos_online_orders
for each row execute function public.pos_enqueue_online_order_dispatch();

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values(9,'20261007_online_order_fulfillment_v9','sha256:online-order-fulfillment-v9','{"scope":"durable_cashier_dispatch_and_auto_print"}'::jsonb)
on conflict(version) do update set migration_key=excluded.migration_key,checksum=excluded.checksum,metadata=excluded.metadata;

commit;

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
  public.pos_payments,
  public.pos_inventory_items,
  public.pos_inventory_transactions,
  public.pos_inventory_adjustments,
  public.pos_ordering_settings,
  public.pos_online_orders,
  public.pos_online_order_events,
  public.pos_online_order_dispatches;
