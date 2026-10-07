-- ThePOSHaven operational inventory v7.
-- Item-level quantity and sold-out state for Essentials+.
-- Inventory is operational shard state; Universal Catalog remains the master product definition.

begin;

create table if not exists public.pos_inventory_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  catalog_item_id uuid not null,
  tracking_mode text not null default 'untracked',
  quantity_on_hand integer,
  low_stock_threshold integer,
  manual_sold_out boolean not null default false,
  sold_out_reason text,
  sold_out_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, catalog_item_id),
  check (tracking_mode in ('untracked','quantity')),
  check (quantity_on_hand is null or quantity_on_hand >= 0),
  check (low_stock_threshold is null or low_stock_threshold >= 0)
);

create index if not exists pos_inventory_items_location_idx
  on public.pos_inventory_items(location_id, catalog_item_id);
create index if not exists pos_inventory_items_low_stock_idx
  on public.pos_inventory_items(location_id, quantity_on_hand)
  where tracking_mode='quantity';

create table if not exists public.pos_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  idempotency_key text not null,
  source_type text not null,
  source_id text,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(location_id, idempotency_key),
  check (status in ('reserved','released'))
);

create table if not exists public.pos_inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  inventory_transaction_id uuid references public.pos_inventory_transactions(id) on delete set null,
  inventory_item_id uuid not null references public.pos_inventory_items(id) on delete cascade,
  catalog_item_id uuid not null,
  quantity_delta integer not null,
  reason text not null,
  source_type text not null,
  source_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (quantity_delta <> 0)
);

create index if not exists pos_inventory_adjustments_location_idx
  on public.pos_inventory_adjustments(location_id, created_at desc);
create index if not exists pos_inventory_adjustments_item_idx
  on public.pos_inventory_adjustments(inventory_item_id, created_at desc);

alter table public.pos_inventory_items enable row level security;
alter table public.pos_inventory_transactions enable row level security;
alter table public.pos_inventory_adjustments enable row level security;

revoke all on table public.pos_inventory_items from public, anon, authenticated;
revoke all on table public.pos_inventory_transactions from public, anon, authenticated;
revoke all on table public.pos_inventory_adjustments from public, anon, authenticated;

grant select, insert, update, delete on table public.pos_inventory_items to service_role;
grant select, insert, update, delete on table public.pos_inventory_transactions to service_role;
grant select, insert, update, delete on table public.pos_inventory_adjustments to service_role;

create or replace function public.pos_inventory_effective_sold_out(
  p_item public.pos_inventory_items
)
returns boolean
language sql
stable
as $$
  select
    p_item.manual_sold_out
    or (p_item.sold_out_until is not null and p_item.sold_out_until > now())
    or (
      p_item.tracking_mode = 'quantity'
      and coalesce(p_item.quantity_on_hand, 0) <= 0
    );
$$;

create or replace function public.pos_reserve_inventory(
  p_location_id uuid,
  p_lines jsonb,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing public.pos_inventory_transactions%rowtype;
  v_tx public.pos_inventory_transactions%rowtype;
  v_line jsonb;
  v_catalog_item_id uuid;
  v_quantity integer;
  v_item public.pos_inventory_items%rowtype;
  v_result jsonb := '[]'::jsonb;
begin
  if p_location_id is null then raise exception 'pos_inventory_missing_location'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'pos_inventory_missing_lines';
  end if;
  if coalesce(btrim(p_idempotency_key),'')='' then
    raise exception 'pos_inventory_missing_idempotency_key';
  end if;

  select * into v_existing
    from public.pos_inventory_transactions
   where location_id=p_location_id and idempotency_key=p_idempotency_key;

  if found then
    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'status', v_existing.status,
      'idempotent_replay', true
    );
  end if;

  insert into public.pos_inventory_transactions(
    location_id,idempotency_key,source_type,source_id,status
  ) values (
    p_location_id,p_idempotency_key,coalesce(nullif(btrim(p_source_type),''),'unknown'),
    nullif(btrim(p_source_id),''),'reserved'
  )
  returning * into v_tx;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_catalog_item_id := nullif(v_line->>'catalog_item_id','')::uuid;
    v_quantity := coalesce((v_line->>'quantity')::integer,0);
    if v_catalog_item_id is null or v_quantity <= 0 then
      raise exception 'pos_inventory_invalid_line';
    end if;

    select * into v_item
      from public.pos_inventory_items
     where location_id=p_location_id
       and catalog_item_id=v_catalog_item_id
     for update;

    if not found then
      -- No inventory row means the item is untracked and remains sellable.
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'catalog_item_id',v_catalog_item_id,
        'tracked',false,
        'reserved',v_quantity
      ));
      continue;
    end if;

    if public.pos_inventory_effective_sold_out(v_item) then
      raise exception 'pos_inventory_item_sold_out:%', v_catalog_item_id;
    end if;

    if v_item.tracking_mode='quantity' then
      if coalesce(v_item.quantity_on_hand,0) < v_quantity then
        raise exception 'pos_inventory_insufficient:%', v_catalog_item_id;
      end if;

      update public.pos_inventory_items
         set quantity_on_hand=quantity_on_hand-v_quantity,
             updated_at=now()
       where id=v_item.id
       returning * into v_item;

      insert into public.pos_inventory_adjustments(
        location_id,inventory_transaction_id,inventory_item_id,catalog_item_id,
        quantity_delta,reason,source_type,source_id
      ) values (
        p_location_id,v_tx.id,v_item.id,v_catalog_item_id,
        -v_quantity,'sale',coalesce(nullif(btrim(p_source_type),''),'unknown'),
        nullif(btrim(p_source_id),'')
      );
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'catalog_item_id',v_catalog_item_id,
      'tracked',v_item.tracking_mode='quantity',
      'reserved',v_quantity,
      'quantity_on_hand',v_item.quantity_on_hand,
      'low_stock',v_item.tracking_mode='quantity'
        and v_item.low_stock_threshold is not null
        and v_item.quantity_on_hand <= v_item.low_stock_threshold,
      'sold_out',public.pos_inventory_effective_sold_out(v_item)
    ));
  end loop;

  return jsonb_build_object(
    'transaction_id',v_tx.id,
    'status','reserved',
    'idempotent_replay',false,
    'items',v_result
  );
end;
$$;

revoke all on function public.pos_reserve_inventory(uuid,jsonb,text,text,text)
  from public,anon,authenticated;
grant execute on function public.pos_reserve_inventory(uuid,jsonb,text,text,text)
  to service_role;

create or replace function public.pos_adjust_inventory(
  p_location_id uuid,
  p_catalog_item_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_source_type text default 'manual',
  p_source_id text default null
)
returns public.pos_inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.pos_inventory_items%rowtype;
begin
  if p_quantity_delta=0 then raise exception 'pos_inventory_zero_adjustment'; end if;

  select * into v_item
    from public.pos_inventory_items
   where location_id=p_location_id and catalog_item_id=p_catalog_item_id
   for update;

  if not found then raise exception 'pos_inventory_item_not_configured'; end if;
  if v_item.tracking_mode <> 'quantity' then raise exception 'pos_inventory_item_not_quantity_tracked'; end if;
  if coalesce(v_item.quantity_on_hand,0)+p_quantity_delta < 0 then
    raise exception 'pos_inventory_negative_quantity';
  end if;

  update public.pos_inventory_items
     set quantity_on_hand=coalesce(quantity_on_hand,0)+p_quantity_delta,
         updated_at=now()
   where id=v_item.id
   returning * into v_item;

  insert into public.pos_inventory_adjustments(
    location_id,inventory_item_id,catalog_item_id,quantity_delta,reason,source_type,source_id
  ) values (
    p_location_id,v_item.id,p_catalog_item_id,p_quantity_delta,
    coalesce(nullif(btrim(p_reason),''),'manual_adjustment'),
    coalesce(nullif(btrim(p_source_type),''),'manual'),
    nullif(btrim(p_source_id),'')
  );

  return v_item;
end;
$$;

create or replace function public.pos_release_inventory(
  p_location_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $
declare
  v_tx public.pos_inventory_transactions%rowtype;
  v_adjustment public.pos_inventory_adjustments%rowtype;
  v_released integer := 0;
begin
  select * into v_tx
    from public.pos_inventory_transactions
   where location_id=p_location_id and idempotency_key=p_idempotency_key
   for update;

  if not found then
    return jsonb_build_object('status','not_found','released',0);
  end if;
  if v_tx.status='released' then
    return jsonb_build_object('transaction_id',v_tx.id,'status','released','released',0,'idempotent_replay',true);
  end if;

  for v_adjustment in
    select * from public.pos_inventory_adjustments
     where inventory_transaction_id=v_tx.id and quantity_delta < 0
     order by created_at asc, id asc
  loop
    update public.pos_inventory_items
       set quantity_on_hand=coalesce(quantity_on_hand,0)+abs(v_adjustment.quantity_delta),
           updated_at=now()
     where id=v_adjustment.inventory_item_id;

    insert into public.pos_inventory_adjustments(
      location_id,inventory_transaction_id,inventory_item_id,catalog_item_id,
      quantity_delta,reason,source_type,source_id,metadata
    ) values (
      p_location_id,v_tx.id,v_adjustment.inventory_item_id,v_adjustment.catalog_item_id,
      abs(v_adjustment.quantity_delta),'reservation_release','system',v_tx.source_id,
      jsonb_build_object('reverses_adjustment_id',v_adjustment.id)
    );
    v_released := v_released + abs(v_adjustment.quantity_delta);
  end loop;

  update public.pos_inventory_transactions set status='released' where id=v_tx.id;
  return jsonb_build_object('transaction_id',v_tx.id,'status','released','released',v_released,'idempotent_replay',false);
end;
$;

revoke all on function public.pos_release_inventory(uuid,text) from public,anon,authenticated;
grant execute on function public.pos_release_inventory(uuid,text) to service_role;

revoke all on function public.pos_adjust_inventory(uuid,uuid,integer,text,text,text)
  from public,anon,authenticated;
grant execute on function public.pos_adjust_inventory(uuid,uuid,integer,text,text,text)
  to service_role;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (
  7,
  '20261007_pos_inventory_v7',
  'sha256:pos-inventory-v7',
  '{"scope":"essentials_item_inventory_and_sold_out"}'::jsonb
)
on conflict (version) do update
set migration_key=excluded.migration_key,
    checksum=excluded.checksum,
    metadata=excluded.metadata;

commit;

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
  public.pos_payments,
  public.pos_inventory_items,
  public.pos_inventory_transactions,
  public.pos_inventory_adjustments;
