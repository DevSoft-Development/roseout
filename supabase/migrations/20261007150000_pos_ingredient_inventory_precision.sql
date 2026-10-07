-- Signature+ ingredient inventory precision and purchasing metadata.
-- toh:replicated-dml-reviewed
-- Keeps Essentials+ item counts compatible while allowing fractional ingredient quantities.

alter table public.pos_inventory_items
  alter column quantity_on_hand type numeric(14,4) using quantity_on_hand::numeric,
  alter column low_stock_threshold type numeric(14,4) using low_stock_threshold::numeric;

alter table public.pos_inventory_adjustments
  alter column quantity_delta type numeric(14,4) using quantity_delta::numeric;

alter table public.pos_inventory_items
  add column if not exists unit_code text not null default 'unit',
  add column if not exists reorder_point numeric(14,4),
  add column if not exists reorder_quantity numeric(14,4),
  add column if not exists preferred_vendor text,
  add column if not exists vendor_sku text;

alter table public.pos_inventory_items
  drop constraint if exists pos_inventory_items_reorder_point_check,
  add constraint pos_inventory_items_reorder_point_check check (reorder_point is null or reorder_point >= 0),
  drop constraint if exists pos_inventory_items_reorder_quantity_check,
  add constraint pos_inventory_items_reorder_quantity_check check (reorder_quantity is null or reorder_quantity > 0);

drop function if exists public.pos_adjust_inventory(uuid,uuid,integer,text,text,text);

create or replace function public.pos_adjust_inventory(
  p_location_id uuid,
  p_catalog_item_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_source_type text default 'manual',
  p_source_id text default null
)
returns public.pos_inventory_items
language plpgsql
security invoker
set search_path=public
as $$
declare v_item public.pos_inventory_items%rowtype;
begin
  if p_quantity_delta=0 then raise exception 'pos_inventory_zero_adjustment'; end if;
  select * into v_item from public.pos_inventory_items
   where location_id=p_location_id and catalog_item_id=p_catalog_item_id for update;
  if not found then raise exception 'pos_inventory_item_not_configured'; end if;
  if v_item.tracking_mode<>'quantity' then raise exception 'pos_inventory_item_not_quantity_tracked'; end if;
  if coalesce(v_item.quantity_on_hand,0)+p_quantity_delta<0 then raise exception 'pos_inventory_negative_quantity'; end if;

  update public.pos_inventory_items
     set quantity_on_hand=coalesce(quantity_on_hand,0)+p_quantity_delta,updated_at=now()
   where id=v_item.id returning * into v_item;

  insert into public.pos_inventory_adjustments(
    location_id,inventory_item_id,catalog_item_id,quantity_delta,reason,source_type,source_id
  ) values (
    p_location_id,v_item.id,p_catalog_item_id,p_quantity_delta,
    coalesce(nullif(btrim(p_reason),''),'manual_adjustment'),
    coalesce(nullif(btrim(p_source_type),''),'manual'),nullif(btrim(p_source_id),'')
  );
  return v_item;
end;
$$;

revoke all on function public.pos_adjust_inventory(uuid,uuid,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.pos_adjust_inventory(uuid,uuid,numeric,text,text,text) to service_role;

create table if not exists public.pos_inventory_stock_areas (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id,code)
);

create table if not exists public.pos_inventory_area_balances (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  inventory_item_id uuid not null references public.pos_inventory_items(id) on delete cascade,
  stock_area_id uuid not null references public.pos_inventory_stock_areas(id) on delete cascade,
  quantity numeric(14,4) not null default 0 check (quantity>=0),
  updated_at timestamptz not null default now(),
  unique(inventory_item_id,stock_area_id)
);

create table if not exists public.pos_inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  inventory_item_id uuid not null references public.pos_inventory_items(id) on delete cascade,
  from_stock_area_id uuid not null references public.pos_inventory_stock_areas(id),
  to_stock_area_id uuid not null references public.pos_inventory_stock_areas(id),
  quantity numeric(14,4) not null check (quantity>0),
  status text not null default 'completed' check (status in ('completed','voided')),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (from_stock_area_id<>to_stock_area_id)
);

alter table public.pos_inventory_stock_areas enable row level security;
alter table public.pos_inventory_area_balances enable row level security;
alter table public.pos_inventory_transfers enable row level security;
revoke all on table public.pos_inventory_stock_areas,public.pos_inventory_area_balances,public.pos_inventory_transfers from public,anon,authenticated;
grant select,insert,update,delete on table public.pos_inventory_stock_areas,public.pos_inventory_area_balances,public.pos_inventory_transfers to service_role;

create or replace function public.pos_transfer_inventory(
  p_location_id uuid,p_catalog_item_id uuid,p_from_area_id uuid,p_to_area_id uuid,p_quantity numeric,p_source_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_item public.pos_inventory_items%rowtype; v_from public.pos_inventory_area_balances%rowtype; v_transfer uuid;
begin
  if coalesce(p_quantity,0)<=0 then raise exception 'pos_inventory_invalid_transfer_quantity'; end if;
  select * into v_item from public.pos_inventory_items where location_id=p_location_id and catalog_item_id=p_catalog_item_id;
  if not found then raise exception 'pos_inventory_item_not_configured'; end if;
  select * into v_from from public.pos_inventory_area_balances
   where location_id=p_location_id and inventory_item_id=v_item.id and stock_area_id=p_from_area_id for update;
  if not found or v_from.quantity<p_quantity then raise exception 'pos_inventory_transfer_insufficient'; end if;
  update public.pos_inventory_area_balances set quantity=quantity-p_quantity,updated_at=now() where id=v_from.id;
  insert into public.pos_inventory_area_balances(location_id,inventory_item_id,stock_area_id,quantity)
  values(p_location_id,v_item.id,p_to_area_id,p_quantity)
  on conflict(inventory_item_id,stock_area_id) do update set quantity=public.pos_inventory_area_balances.quantity+excluded.quantity,updated_at=now();
  insert into public.pos_inventory_transfers(location_id,inventory_item_id,from_stock_area_id,to_stock_area_id,quantity,metadata)
  values(p_location_id,v_item.id,p_from_area_id,p_to_area_id,p_quantity,jsonb_build_object('source_id',p_source_id))
  returning id into v_transfer;
  return v_transfer;
end;
$$;

revoke all on function public.pos_transfer_inventory(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.pos_transfer_inventory(uuid,uuid,uuid,uuid,numeric,text) to service_role;
