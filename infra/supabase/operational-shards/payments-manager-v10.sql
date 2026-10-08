-- Operational shard schema v10: payments + manager controls.
begin;

create table if not exists public.pos_manager_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  action text not null,
  check_id uuid null references public.pos_checks(id) on delete set null,
  order_item_id uuid null references public.pos_order_items(id) on delete set null,
  tender_id uuid null references public.pos_tenders(id) on delete set null,
  actor_staff_profile_id uuid null,
  approver_staff_profile_id uuid null,
  reason text not null,
  amount_cents integer null check (amount_cents is null or amount_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_manager_events_location_created_idx
  on public.pos_manager_events(location_id, created_at desc);

create table if not exists public.pos_cash_drawer_sessions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  device_id text not null,
  staff_profile_id uuid null,
  status text not null default 'open' check (status in ('open','closed')),
  opening_cash_cents integer not null default 0 check (opening_cash_cents >= 0),
  expected_cash_cents integer null check (expected_cash_cents is null or expected_cash_cents >= 0),
  counted_cash_cents integer null check (counted_cash_cents is null or counted_cash_cents >= 0),
  over_short_cents integer null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists pos_cash_drawer_one_open_per_device_idx
  on public.pos_cash_drawer_sessions(location_id, device_id)
  where status='open';

create index if not exists pos_cash_drawer_sessions_location_idx
  on public.pos_cash_drawer_sessions(location_id, opened_at desc);

create table if not exists public.pos_refund_requests (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  tender_id uuid not null references public.pos_tenders(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  actor_staff_profile_id uuid null,
  approver_staff_profile_id uuid null,
  provider text null,
  provider_payment_intent_id text null,
  provider_refund_id text null,
  status text not null default 'initiated' check (status in ('initiated','completed','failed')),
  idempotency_key text not null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique(location_id, idempotency_key)
);

create index if not exists pos_refund_requests_tender_idx
  on public.pos_refund_requests(tender_id, created_at desc);

alter table public.pos_manager_events enable row level security;
alter table public.pos_cash_drawer_sessions enable row level security;
alter table public.pos_refund_requests enable row level security;

revoke all on table public.pos_manager_events from public, anon, authenticated;
revoke all on table public.pos_cash_drawer_sessions from public, anon, authenticated;
revoke all on table public.pos_refund_requests from public, anon, authenticated;

grant select, insert, update, delete on table public.pos_manager_events to service_role;
grant select, insert, update, delete on table public.pos_cash_drawer_sessions to service_role;
grant select, insert, update, delete on table public.pos_refund_requests to service_role;

create or replace function public.pos_record_cash_tender(
  p_location_id uuid,
  p_check_id uuid,
  p_cash_received_cents integer,
  p_amount_cents integer default null,
  p_tip_cents integer default 0,
  p_staff_profile_id uuid default null,
  p_device_id text default null
)
returns table (
  tender_id uuid,
  tender_number integer,
  amount_cents integer,
  tip_cents integer,
  cash_received_cents integer,
  cash_change_cents integer,
  remaining_cents integer,
  check_closed boolean
)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_check public.pos_checks%rowtype;
  v_net_paid integer;
  v_remaining integer;
  v_amount integer;
  v_tender_number integer;
  v_tender_id uuid;
  v_change integer;
  v_after integer;
begin
  if coalesce(p_cash_received_cents,0)<=0 then raise exception 'invalid_pos_cash_received'; end if;
  if coalesce(p_tip_cents,0)<0 then raise exception 'invalid_pos_tip_amount'; end if;

  select * into v_check
    from public.pos_checks
   where id=p_check_id and location_id=p_location_id
   for update;
  if not found then raise exception 'pos_check_not_found'; end if;
  if v_check.status not in ('open','held') then raise exception 'pos_check_not_payable'; end if;

  select coalesce(sum(greatest(0,t.amount_cents-t.amount_refunded_cents)),0)
    into v_net_paid
    from public.pos_tenders t
   where t.check_id=p_check_id and t.location_id=p_location_id
     and t.status in ('completed','partially_refunded','refunded');

  v_remaining:=greatest(0,v_check.total_cents-v_net_paid);
  if v_remaining<=0 then raise exception 'pos_check_already_paid'; end if;

  v_amount:=least(coalesce(p_amount_cents,v_remaining),v_remaining);
  if v_amount<=0 then raise exception 'invalid_pos_cash_amount'; end if;
  if p_cash_received_cents < v_amount + coalesce(p_tip_cents,0) then
    raise exception 'pos_cash_received_insufficient';
  end if;
  v_change:=p_cash_received_cents-v_amount-coalesce(p_tip_cents,0);

  select coalesce(max(t.tender_number),0)+1 into v_tender_number
    from public.pos_tenders t where t.check_id=p_check_id;

  insert into public.pos_tenders(
    location_id,check_id,staff_profile_id,tender_number,tender_type,status,
    amount_cents,tip_cents,cash_received_cents,cash_change_cents,completed_at,metadata
  ) values (
    p_location_id,p_check_id,p_staff_profile_id,v_tender_number,'cash','completed',
    v_amount,coalesce(p_tip_cents,0),p_cash_received_cents,v_change,now(),
    jsonb_build_object('device_id',p_device_id)
  ) returning id into v_tender_id;

  v_after:=greatest(0,v_remaining-v_amount);
  update public.pos_checks
     set amount_paid_cents=amount_paid_cents+v_amount,
         tip_cents=tip_cents+coalesce(p_tip_cents,0),
         status=case when v_after=0 then 'closed' else status end,
         closed_at=case when v_after=0 then coalesce(closed_at,now()) else closed_at end,
         updated_at=now()
   where id=p_check_id and location_id=p_location_id;

  return query select
    v_tender_id,v_tender_number,v_amount,coalesce(p_tip_cents,0),
    p_cash_received_cents,v_change,v_after,(v_after=0);
end;
$$;

create or replace function public.pos_apply_check_discount(
  p_location_id uuid,
  p_check_id uuid,
  p_discount_cents integer,
  p_actor_staff_profile_id uuid,
  p_approver_staff_profile_id uuid,
  p_reason text
)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_check public.pos_checks%rowtype;
  v_discount integer;
begin
  if coalesce(p_discount_cents,0)<0 then raise exception 'invalid_pos_discount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'pos_manager_reason_required'; end if;
  if p_approver_staff_profile_id is null then raise exception 'pos_manager_approval_required'; end if;

  select * into v_check from public.pos_checks
   where id=p_check_id and location_id=p_location_id for update;
  if not found then raise exception 'pos_check_not_found'; end if;
  if v_check.status not in ('open','held') then raise exception 'pos_check_not_adjustable'; end if;

  v_discount:=least(p_discount_cents,v_check.subtotal_cents);
  update public.pos_checks
     set discount_cents=v_discount,
         total_cents=greatest(0,subtotal_cents-v_discount+tax_cents+service_charge_cents),
         updated_at=now()
   where id=p_check_id and location_id=p_location_id;

  insert into public.pos_manager_events(
    location_id,action,check_id,actor_staff_profile_id,approver_staff_profile_id,
    reason,amount_cents
  ) values (
    p_location_id,'check_discount',p_check_id,p_actor_staff_profile_id,
    p_approver_staff_profile_id,trim(p_reason),v_discount
  );

  return v_discount;
end;
$$;

create or replace function public.pos_void_order_item(
  p_location_id uuid,
  p_order_item_id uuid,
  p_actor_staff_profile_id uuid,
  p_approver_staff_profile_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_item public.pos_order_items%rowtype;
begin
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'pos_manager_reason_required'; end if;
  if p_approver_staff_profile_id is null then raise exception 'pos_manager_approval_required'; end if;

  select * into v_item from public.pos_order_items
   where id=p_order_item_id and location_id=p_location_id for update;
  if not found then raise exception 'pos_order_item_not_found'; end if;
  if v_item.status='voided' then return v_item.id; end if;

  update public.pos_order_items
     set status='voided',void_reason=trim(p_reason),updated_at=now()
   where id=v_item.id;

  update public.pos_checks c
     set subtotal_cents=greatest(0,c.subtotal_cents-v_item.line_total_cents),
         total_cents=greatest(0,greatest(0,c.subtotal_cents-v_item.line_total_cents)-c.discount_cents+c.tax_cents+c.service_charge_cents),
         updated_at=now()
   where c.id=v_item.check_id and c.location_id=p_location_id
     and c.status in ('open','held');

  insert into public.pos_manager_events(
    location_id,action,check_id,order_item_id,actor_staff_profile_id,
    approver_staff_profile_id,reason,amount_cents
  ) values (
    p_location_id,'void_item',v_item.check_id,v_item.id,p_actor_staff_profile_id,
    p_approver_staff_profile_id,trim(p_reason),v_item.line_total_cents
  );

  return v_item.id;
end;
$$;

create or replace function public.pos_begin_tender_refund(
  p_location_id uuid,
  p_tender_id uuid,
  p_amount_cents integer,
  p_actor_staff_profile_id uuid,
  p_approver_staff_profile_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns table(
  refund_request_id uuid,
  tender_type text,
  amount_cents integer,
  provider text,
  provider_payment_intent_id text
)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_tender public.pos_tenders%rowtype;
  v_available integer;
  v_pending integer;
  v_request_id uuid;
  v_provider text;
  v_payment_intent text;
begin
  if coalesce(p_amount_cents,0)<=0 then raise exception 'invalid_pos_refund_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'pos_manager_reason_required'; end if;
  if p_approver_staff_profile_id is null then raise exception 'pos_manager_approval_required'; end if;
  if nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'pos_refund_idempotency_required'; end if;

  select * into v_tender from public.pos_tenders
   where id=p_tender_id and location_id=p_location_id for update;
  if not found then raise exception 'pos_tender_not_found'; end if;
  if v_tender.status not in ('completed','partially_refunded') then raise exception 'pos_tender_not_refundable'; end if;

  select coalesce(sum(r.amount_cents),0) into v_pending
    from public.pos_refund_requests r
   where r.tender_id=p_tender_id and r.status='initiated';

  v_available:=greatest(0,v_tender.amount_cents-v_tender.amount_refunded_cents-v_pending);
  if p_amount_cents>v_available then raise exception 'pos_refund_exceeds_available'; end if;

  select p.provider,p.provider_payment_intent_id
    into v_provider,v_payment_intent
    from public.pos_payments p
   where p.tender_id=p_tender_id
   order by p.created_at desc
   limit 1;

  insert into public.pos_refund_requests(
    location_id,check_id,tender_id,amount_cents,reason,
    actor_staff_profile_id,approver_staff_profile_id,provider,
    provider_payment_intent_id,idempotency_key
  ) values (
    p_location_id,v_tender.check_id,p_tender_id,p_amount_cents,trim(p_reason),
    p_actor_staff_profile_id,p_approver_staff_profile_id,
    case when v_tender.tender_type='card' then v_provider else null end,
    case when v_tender.tender_type='card' then v_payment_intent else null end,
    trim(p_idempotency_key)
  )
  on conflict(location_id,idempotency_key) do update
    set idempotency_key=excluded.idempotency_key
  returning id into v_request_id;

  return query select
    v_request_id,v_tender.tender_type,p_amount_cents,
    case when v_tender.tender_type='card' then v_provider else null end,
    case when v_tender.tender_type='card' then v_payment_intent else null end;
end;
$$;

create or replace function public.pos_finalize_tender_refund(
  p_location_id uuid,
  p_refund_request_id uuid,
  p_provider_refund_id text default null
)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_request public.pos_refund_requests%rowtype;
  v_tender public.pos_tenders%rowtype;
  v_total integer;
begin
  select * into v_request from public.pos_refund_requests
   where id=p_refund_request_id and location_id=p_location_id for update;
  if not found then raise exception 'pos_refund_request_not_found'; end if;
  if v_request.status='completed' then return v_request.amount_cents; end if;
  if v_request.status<>'initiated' then raise exception 'pos_refund_request_not_active'; end if;

  select * into v_tender from public.pos_tenders where id=v_request.tender_id for update;
  if not found then raise exception 'pos_tender_not_found'; end if;

  v_total:=v_tender.amount_refunded_cents+v_request.amount_cents;
  update public.pos_tenders
     set amount_refunded_cents=v_total,
         status=case when v_total>=amount_cents then 'refunded' else 'partially_refunded' end,
         updated_at=now()
   where id=v_tender.id;

  update public.pos_checks
     set amount_refunded_cents=amount_refunded_cents+v_request.amount_cents,
         updated_at=now()
   where id=v_tender.check_id and location_id=p_location_id;

  if v_tender.tender_type='card' then
    update public.pos_payments
       set status=case when v_total>=v_tender.amount_cents then 'refunded' else 'partially_refunded' end,
           updated_at=now()
     where tender_id=v_tender.id;
  end if;

  update public.pos_refund_requests
     set status='completed',provider_refund_id=p_provider_refund_id,
         completed_at=now(),error_message=null
   where id=v_request.id;

  insert into public.pos_manager_events(
    location_id,action,check_id,tender_id,actor_staff_profile_id,
    approver_staff_profile_id,reason,amount_cents,metadata
  ) values (
    p_location_id,'refund',v_request.check_id,v_request.tender_id,
    v_request.actor_staff_profile_id,v_request.approver_staff_profile_id,
    v_request.reason,v_request.amount_cents,
    jsonb_build_object('refund_request_id',v_request.id,'provider_refund_id',p_provider_refund_id)
  );

  return v_request.amount_cents;
end;
$$;

create or replace function public.pos_fail_tender_refund(
  p_location_id uuid,
  p_refund_request_id uuid,
  p_error_message text
)
returns void
language plpgsql
security invoker
set search_path=public
as $$
begin
  update public.pos_refund_requests
     set status='failed',error_message=left(coalesce(p_error_message,'refund_failed'),1000)
   where id=p_refund_request_id and location_id=p_location_id and status='initiated';
end;
$$;

create or replace function public.pos_open_cash_drawer_session(
  p_location_id uuid,
  p_device_id text,
  p_staff_profile_id uuid,
  p_opening_cash_cents integer
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_id uuid;
begin
  if nullif(trim(coalesce(p_device_id,'')),'') is null then raise exception 'pos_device_id_required'; end if;
  if coalesce(p_opening_cash_cents,0)<0 then raise exception 'invalid_pos_opening_cash'; end if;

  insert into public.pos_cash_drawer_sessions(
    location_id,device_id,staff_profile_id,opening_cash_cents
  ) values (
    p_location_id,trim(p_device_id),p_staff_profile_id,p_opening_cash_cents
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.pos_close_cash_drawer_session(
  p_location_id uuid,
  p_session_id uuid,
  p_counted_cash_cents integer
)
returns table(expected_cash_cents integer,counted_cash_cents integer,over_short_cents integer)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_session public.pos_cash_drawer_sessions%rowtype;
  v_cash_sales integer;
  v_cash_refunds integer;
  v_expected integer;
begin
  if coalesce(p_counted_cash_cents,0)<0 then raise exception 'invalid_pos_counted_cash'; end if;

  select * into v_session from public.pos_cash_drawer_sessions
   where id=p_session_id and location_id=p_location_id for update;
  if not found then raise exception 'pos_cash_drawer_session_not_found'; end if;
  if v_session.status<>'open' then raise exception 'pos_cash_drawer_session_closed'; end if;

  select coalesce(sum(t.amount_cents+t.tip_cents-t.cash_change_cents),0)
    into v_cash_sales
    from public.pos_tenders t
   where t.location_id=p_location_id and t.tender_type='cash'
     and t.status in ('completed','partially_refunded','refunded')
     and t.created_at>=v_session.opened_at;

  select coalesce(sum(r.amount_cents),0)
    into v_cash_refunds
    from public.pos_refund_requests r
    join public.pos_tenders t on t.id=r.tender_id
   where r.location_id=p_location_id and r.status='completed'
     and t.tender_type='cash' and r.created_at>=v_session.opened_at;

  v_expected:=greatest(0,v_session.opening_cash_cents+v_cash_sales-v_cash_refunds);

  update public.pos_cash_drawer_sessions
     set status='closed',expected_cash_cents=v_expected,
         counted_cash_cents=p_counted_cash_cents,
         over_short_cents=p_counted_cash_cents-v_expected,
         closed_at=now()
   where id=v_session.id;

  return query select v_expected,p_counted_cash_cents,p_counted_cash_cents-v_expected;
end;
$$;

revoke all on function public.pos_record_cash_tender(uuid,uuid,integer,integer,integer,uuid,text) from public,anon,authenticated;
revoke all on function public.pos_apply_check_discount(uuid,uuid,integer,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pos_void_order_item(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pos_begin_tender_refund(uuid,uuid,integer,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.pos_finalize_tender_refund(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pos_fail_tender_refund(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.pos_open_cash_drawer_session(uuid,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.pos_close_cash_drawer_session(uuid,uuid,integer) from public,anon,authenticated;

grant execute on function public.pos_record_cash_tender(uuid,uuid,integer,integer,integer,uuid,text) to service_role;
grant execute on function public.pos_apply_check_discount(uuid,uuid,integer,uuid,uuid,text) to service_role;
grant execute on function public.pos_void_order_item(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.pos_begin_tender_refund(uuid,uuid,integer,uuid,uuid,text,text) to service_role;
grant execute on function public.pos_finalize_tender_refund(uuid,uuid,text) to service_role;
grant execute on function public.pos_fail_tender_refund(uuid,uuid,text) to service_role;
grant execute on function public.pos_open_cash_drawer_session(uuid,text,uuid,integer) to service_role;
grant execute on function public.pos_close_cash_drawer_session(uuid,uuid,integer) to service_role;

insert into public.operational_schema_versions(version,migration_key,checksum,metadata)
values (10,'20261007_pos_payments_manager_v10','sha256:pos-payments-manager-v10',
  '{"scope":"cash_refunds_voids_discounts_drawer_closeout"}'::jsonb)
on conflict (version) do update
set migration_key=excluded.migration_key,checksum=excluded.checksum,metadata=excluded.metadata;

commit;

do $$
begin
  if not exists (select 1 from pg_publication where pubname='toh_operational_dr') then
    execute 'create publication toh_operational_dr for table public.locations';
  end if;
end $$;

alter publication toh_operational_dr add table public.pos_manager_events;
alter publication toh_operational_dr add table public.pos_cash_drawer_sessions;
alter publication toh_operational_dr add table public.pos_refund_requests;
