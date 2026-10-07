-- ThePOSHaven online ordering v8.
-- Adds pickup ordering state and atomic draft creation on operational shards.

begin;

create table if not exists public.pos_ordering_settings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique,
  accepting_orders boolean not null default true,
  auto_accept boolean not null default true,
  auto_print boolean not null default true,
  default_prep_minutes integer not null default 25 check (default_prep_minutes between 1 and 240),
  prep_delay_minutes integer not null default 0 check (prep_delay_minutes between 0 and 240),
  paused_until timestamptz,
  timezone text not null default 'America/New_York',
  slot_minutes integer not null default 15 check (slot_minutes between 5 and 120),
  max_orders_per_slot integer check (max_orders_per_slot is null or max_orders_per_slot > 0),
  cutoff_minutes_before_close integer not null default 15 check (cutoff_minutes_before_close between 0 and 240),
  max_advance_days integer not null default 7 check (max_advance_days between 0 and 90),
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 2500),
  service_charge_bps integer not null default 0 check (service_charge_bps between 0 and 5000),
  ordering_hours jsonb not null default '{}'::jsonb,
  pickup_instructions text,
  notification_settings jsonb not null default '{"pos":true,"push":true,"email":false,"sms":false}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_online_orders (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  tender_id uuid not null references public.pos_tenders(id) on delete cascade,
  source text not null default 'website' check (source in ('website','qr_ordering','kiosk')),
  status text not null default 'received'
    check (status in ('received','accepted','preparing','ready','completed','canceled')),
  customer_name text not null,
  customer_email text,
  customer_phone text,
  requested_pickup_at timestamptz,
  promised_pickup_at timestamptz,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  service_charge_cents integer not null default 0 check (service_charge_cents >= 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  total_cents integer not null check (total_cents > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  payment_provider text not null default 'stripe',
  provider_payment_intent_id text,
  inventory_idempotency_key text not null,
  idempotency_key text not null,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, idempotency_key),
  unique(provider_payment_intent_id)
);

create index if not exists pos_online_orders_location_status_idx
  on public.pos_online_orders(location_id,status,created_at desc);
create index if not exists pos_online_orders_pickup_idx
  on public.pos_online_orders(location_id,promised_pickup_at)
  where status in ('received','accepted','preparing');

create table if not exists public.pos_online_order_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  online_order_id uuid not null references public.pos_online_orders(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pos_online_order_events_order_idx
  on public.pos_online_order_events(online_order_id,created_at);

alter table public.pos_ordering_settings enable row level security;
alter table public.pos_online_orders enable row level security;
alter table public.pos_online_order_events enable row level security;
revoke all on table public.pos_ordering_settings from public,anon,authenticated;
revoke all on table public.pos_online_orders from public,anon,authenticated;
revoke all on table public.pos_online_order_events from public,anon,authenticated;
grant select,insert,update,delete on table public.pos_ordering_settings to service_role;
grant select,insert,update,delete on table public.pos_online_orders to service_role;
grant select,insert,update,delete on table public.pos_online_order_events to service_role;

create or replace function public.pos_create_online_order_draft(
  p_location_id uuid,
  p_idempotency_key text,
  p_inventory_idempotency_key text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_requested_pickup_at timestamptz,
  p_promised_pickup_at timestamptz,
  p_subtotal_cents integer,
  p_tax_cents integer,
  p_service_charge_cents integer,
  p_tip_cents integer,
  p_currency text,
  p_lines jsonb,
  p_source text default 'website'
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_existing public.pos_online_orders%rowtype;
  v_check_id uuid;
  v_order_id uuid;
  v_tender_id uuid;
  v_online_order_id uuid;
  v_line jsonb;
  v_tender_number integer := 1;
  v_total integer;
begin
  if p_location_id is null then raise exception 'online_order_missing_location'; end if;
  if coalesce(btrim(p_idempotency_key),'')='' then raise exception 'online_order_missing_idempotency_key'; end if;
  if coalesce(btrim(p_inventory_idempotency_key),'')='' then raise exception 'online_order_missing_inventory_key'; end if;
  if coalesce(btrim(p_customer_name),'')='' then raise exception 'online_order_missing_customer_name'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then raise exception 'online_order_missing_lines'; end if;
  if p_subtotal_cents < 0 or p_tax_cents < 0 or p_service_charge_cents < 0 or p_tip_cents < 0 then
    raise exception 'online_order_invalid_totals';
  end if;
  v_total := p_subtotal_cents+p_tax_cents+p_service_charge_cents+p_tip_cents;
  if v_total <= 0 then raise exception 'online_order_invalid_total'; end if;

  select * into v_existing
    from public.pos_online_orders
   where location_id=p_location_id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object(
      'online_order_id',v_existing.id,
      'check_id',v_existing.check_id,
      'order_id',v_existing.order_id,
      'tender_id',v_existing.tender_id,
      'idempotent_replay',true
    );
  end if;

  insert into public.pos_checks(
    location_id,status,guest_count,currency,subtotal_cents,discount_cents,tax_cents,
    service_charge_cents,total_cents,tip_cents,notes,metadata
  ) values (
    p_location_id,'held',1,lower(coalesce(nullif(p_currency,''),'usd')),p_subtotal_cents,0,p_tax_cents,
    p_service_charge_cents,p_subtotal_cents+p_tax_cents+p_service_charge_cents,p_tip_cents,
    'Website pickup order',
    jsonb_build_object('source','online_ordering','idempotency_key',p_idempotency_key)
  ) returning id into v_check_id;

  insert into public.pos_orders(
    location_id,check_id,status,notes,metadata
  ) values (
    p_location_id,v_check_id,'draft','Pickup order',
    jsonb_build_object('source','online_ordering','fulfillment','pickup')
  ) returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    insert into public.pos_order_items(
      location_id,order_id,check_id,catalog_item_id,item_name,quantity,
      unit_price_cents,unit_modifier_total_cents,discount_cents,modifiers,notes,status
    ) values (
      p_location_id,v_order_id,v_check_id,nullif(v_line->>'catalog_item_id','')::uuid,
      coalesce(nullif(v_line->>'name',''),'Item'),
      greatest(1,coalesce((v_line->>'quantity')::integer,1)),
      greatest(0,coalesce((v_line->>'unit_price_cents')::integer,0)),
      greatest(0,coalesce((v_line->>'unit_modifier_total_cents')::integer,0)),
      0,
      coalesce(v_line->'modifiers','[]'::jsonb),
      nullif(v_line->>'notes',''),
      'active'
    );
  end loop;

  insert into public.pos_tenders(
    location_id,check_id,tender_number,tender_type,status,amount_cents,tip_cents,metadata
  ) values (
    p_location_id,v_check_id,v_tender_number,'card','initiated',
    p_subtotal_cents+p_tax_cents+p_service_charge_cents,p_tip_cents,
    jsonb_build_object('source','online_ordering')
  ) returning id into v_tender_id;

  insert into public.pos_online_orders(
    location_id,check_id,order_id,tender_id,source,status,customer_name,customer_email,customer_phone,
    requested_pickup_at,promised_pickup_at,subtotal_cents,tax_cents,service_charge_cents,tip_cents,total_cents,
    currency,inventory_idempotency_key,idempotency_key
  ) values (
    p_location_id,v_check_id,v_order_id,v_tender_id,p_source,'received',btrim(p_customer_name),
    nullif(btrim(p_customer_email),''),nullif(btrim(p_customer_phone),''),
    p_requested_pickup_at,p_promised_pickup_at,p_subtotal_cents,p_tax_cents,p_service_charge_cents,p_tip_cents,v_total,
    lower(coalesce(nullif(p_currency,''),'usd')),p_inventory_idempotency_key,p_idempotency_key
  ) returning id into v_online_order_id;

  insert into public.pos_online_order_events(location_id,online_order_id,event_type,metadata)
  values(p_location_id,v_online_order_id,'order_draft_created',jsonb_build_object('source',p_source));

  return jsonb_build_object(
    'online_order_id',v_online_order_id,
    'check_id',v_check_id,
    'order_id',v_order_id,
    'tender_id',v_tender_id,
    'idempotent_replay',false
  );
end;
$$;

revoke all on function public.pos_create_online_order_draft(
  uuid,text,text,text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,text,jsonb,text
) from public,anon,authenticated;
grant execute on function public.pos_create_online_order_draft(
  uuid,text,text,text,text,text,timestamptz,timestamptz,integer,integer,integer,integer,text,jsonb,text
) to service_role;

create or replace function public.pos_finalize_online_order_payment(
  p_location_id uuid,
  p_online_order_id uuid,
  p_provider_payment_intent_id text,
  p_auto_accept boolean
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $
declare
  v_order public.pos_online_orders%rowtype;
  v_next_status text;
begin
  select * into v_order
    from public.pos_online_orders
   where id=p_online_order_id and location_id=p_location_id
   for update;
  if not found then raise exception 'online_order_not_found'; end if;
  if v_order.status in ('completed','canceled') then
    return jsonb_build_object('online_order_id',v_order.id,'status',v_order.status,'idempotent_replay',true);
  end if;

  v_next_status := case when p_auto_accept then 'accepted' else 'received' end;

  update public.pos_tenders
     set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
   where id=v_order.tender_id and location_id=p_location_id and status in ('initiated','completed');

  update public.pos_payments
     set status='succeeded',succeeded_at=coalesce(succeeded_at,now()),processed_at=coalesce(processed_at,now()),updated_at=now()
   where tender_id=v_order.tender_id
     and location_id=p_location_id
     and provider_payment_intent_id=p_provider_payment_intent_id;

  update public.pos_checks
     set status='open',
         amount_paid_cents=greatest(amount_paid_cents,v_order.subtotal_cents+v_order.tax_cents+v_order.service_charge_cents),
         updated_at=now()
   where id=v_order.check_id;

  update public.pos_orders
     set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now()
   where id=v_order.order_id;

  update public.pos_order_items
     set status='sent',updated_at=now()
   where order_id=v_order.order_id and status='active';

  update public.pos_online_orders
     set provider_payment_intent_id=p_provider_payment_intent_id,
         status=v_next_status,
         accepted_at=case when p_auto_accept then coalesce(accepted_at,now()) else accepted_at end,
         updated_at=now()
   where id=v_order.id
   returning * into v_order;

  insert into public.pos_online_order_events(location_id,online_order_id,event_type,metadata)
  values(p_location_id,v_order.id,'payment_succeeded',jsonb_build_object('provider_payment_intent_id',p_provider_payment_intent_id));
  if p_auto_accept then
    insert into public.pos_online_order_events(location_id,online_order_id,event_type,metadata)
    values(p_location_id,v_order.id,'order_accepted',jsonb_build_object('automatic',true));
  end if;

  return jsonb_build_object('online_order_id',v_order.id,'status',v_order.status,'idempotent_replay',false);
end;
$;

revoke all on function public.pos_finalize_online_order_payment(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.pos_finalize_online_order_payment(uuid,uuid,text,boolean) to service_role;

create or replace function public.pos_cancel_online_order(
  p_location_id uuid,
  p_online_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $
declare
  v_order public.pos_online_orders%rowtype;
begin
  select * into v_order
    from public.pos_online_orders
   where id=p_online_order_id and location_id=p_location_id
   for update;
  if not found then raise exception 'online_order_not_found'; end if;
  if v_order.status='canceled' then
    return jsonb_build_object('online_order_id',v_order.id,'status','canceled','idempotent_replay',true);
  end if;
  if v_order.status='completed' then raise exception 'online_order_already_completed'; end if;

  update public.pos_online_orders
     set status='canceled',canceled_at=coalesce(canceled_at,now()),cancel_reason=coalesce(nullif(btrim(p_reason),''),'canceled'),updated_at=now()
   where id=v_order.id;
  update public.pos_orders
     set status='voided',voided_at=coalesce(voided_at,now()),void_reason=coalesce(nullif(btrim(p_reason),''),'canceled'),updated_at=now()
   where id=v_order.order_id and status <> 'fulfilled';
  update public.pos_order_items
     set status='voided',void_reason=coalesce(nullif(btrim(p_reason),''),'canceled'),updated_at=now()
   where order_id=v_order.order_id and status <> 'fulfilled';
  update public.pos_tenders
     set status='voided',voided_at=coalesce(voided_at,now()),updated_at=now()
   where id=v_order.tender_id and status='initiated';
  update public.pos_checks
     set status='voided',voided_at=coalesce(voided_at,now()),updated_at=now()
   where id=v_order.check_id and status <> 'closed';

  insert into public.pos_online_order_events(location_id,online_order_id,event_type,metadata)
  values(p_location_id,v_order.id,'order_canceled',jsonb_build_object('reason',coalesce(nullif(btrim(p_reason),''),'canceled')));

  return jsonb_build_object('online_order_id',v_order.id,'status','canceled','idempotent_replay',false);
end;
$;

revoke all on function public.pos_cancel_online_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_cancel_online_order(uuid,uuid,text) to service_role;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values(8,'20261007_online_ordering_v8','sha256:online-ordering-v8','{"scope":"website_pickup_orders_and_settings"}'::jsonb)
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
  public.pos_online_order_events;
