create or replace function fraud_internal.guard_event_ticket_order_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_event public.events;
  v_decision jsonb;
begin
  select * into v_event from public.events where id=new.event_id;
  if v_event.id is null then return new; end if;

  v_decision := public.fraud_decide_subject('event',v_event.id::text);
  if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:event'; end if;

  if v_event.location_id is not null then
    v_decision := public.fraud_decide_subject('location',v_event.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
  elsif v_event.organization_id is not null then
    v_decision := public.fraud_decide_subject('organizer',v_event.organization_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:organizer'; end if;
  end if;

  if new.purchaser_user_id is not null then
    v_decision := public.fraud_decide_subject('user',new.purchaser_user_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:user'; end if;
  end if;

  if new.provider_account_id is not null and btrim(new.provider_account_id) <> '' then
    v_decision := public.fraud_decide_subject('payout','connect-account:' || new.provider_account_id);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:payout'; end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_event_ticket_order_insert() from public, anon, authenticated;

create or replace function fraud_internal.guard_experience_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_experience public.experiences;
  v_decision jsonb;
begin
  select * into v_experience from public.experiences where id=new.experience_id;
  if v_experience.id is null then return new; end if;

  v_decision := public.fraud_decide_subject('experience',v_experience.id::text);
  if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:experience'; end if;

  if v_experience.location_id is not null then
    v_decision := public.fraud_decide_subject('location',v_experience.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
  elsif v_experience.organization_id is not null then
    v_decision := public.fraud_decide_subject('organizer',v_experience.organization_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:organizer'; end if;
  end if;

  if new.customer_user_id is not null then
    v_decision := public.fraud_decide_subject('user',new.customer_user_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:user'; end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_experience_booking_insert() from public, anon, authenticated;

create or replace function fraud_internal.guard_location_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_decision jsonb;
begin
  if new.location_id is not null then
    v_decision := public.fraud_decide_subject('location',new.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
  end if;

  if new.user_id is not null then
    v_decision := public.fraud_decide_subject('user',new.user_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:user'; end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_location_reservation_insert() from public, anon, authenticated;
drop trigger if exists fraud_guard_location_reservation_insert on public.location_reservations;
create trigger fraud_guard_location_reservation_insert
before insert on public.location_reservations
for each row execute function fraud_internal.guard_location_reservation_insert();
