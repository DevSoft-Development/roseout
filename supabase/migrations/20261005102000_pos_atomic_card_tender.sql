-- Atomic POS tender reservation for card payments.
-- Keeps the payable amount authoritative and prevents two devices from charging the same open balance.

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
as $$
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
    tip_cents
  )
  values (
    p_location_id,
    p_check_id,
    p_staff_profile_id,
    v_tender_number,
    'card',
    'initiated',
    v_remaining,
    coalesce(p_tip_cents, 0)
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
$$;

revoke all on function public.pos_begin_card_tender(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.pos_begin_card_tender(uuid, uuid, integer, uuid) to service_role;
