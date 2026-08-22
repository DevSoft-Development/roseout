-- Hard-stop extreme transaction velocity before money movement or inventory allocation.
-- The existing AFTER INSERT detectors begin review at 5 attempts in 15 minutes.
-- These BEFORE INSERT guards allow that review window, then block the 7th matching action.

create or replace function fraud_internal.guard_event_ticket_order_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_event public.events;
  v_decision jsonb;
  v_velocity_count integer := 0;
  v_identity_key text;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event.id is null then return new; end if;

  v_decision := public.fraud_decide_subject('event', v_event.id::text);
  if fraud_internal.decision_blocks_sensitive_action(v_decision) then
    raise exception using errcode = '42501', message = 'fraud_review_required:event';
  end if;

  if v_event.location_id is not null then
    v_decision := public.fraud_decide_subject('location', v_event.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:location';
    end if;
  elsif v_event.organization_id is not null then
    v_decision := public.fraud_decide_subject('organizer', v_event.organization_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:organizer';
    end if;
  end if;

  if new.purchaser_user_id is not null then
    v_decision := public.fraud_decide_subject('user', new.purchaser_user_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:user';
    end if;

    v_identity_key := 'ticket:user:' || new.purchaser_user_id::text;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.event_ticket_orders o
    where o.purchaser_user_id = new.purchaser_user_id
      and o.created_at >= now() - interval '15 minutes';
  elsif new.purchaser_email is not null and btrim(new.purchaser_email) <> '' then
    v_identity_key := 'ticket:email:' || lower(btrim(new.purchaser_email));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.event_ticket_orders o
    where lower(btrim(o.purchaser_email)) = lower(btrim(new.purchaser_email))
      and o.created_at >= now() - interval '15 minutes';
  elsif new.purchaser_phone is not null
        and regexp_replace(new.purchaser_phone, '[^0-9]', '', 'g') <> '' then
    v_identity_key := 'ticket:phone:' || regexp_replace(new.purchaser_phone, '[^0-9]', '', 'g');
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.event_ticket_orders o
    where regexp_replace(coalesce(o.purchaser_phone, ''), '[^0-9]', '', 'g') = regexp_replace(new.purchaser_phone, '[^0-9]', '', 'g')
      and o.created_at >= now() - interval '15 minutes';
  end if;

  if v_velocity_count >= 6 then
    raise exception using errcode = '42501', message = 'fraud_velocity_block:ticket_order';
  end if;

  if new.provider_account_id is not null and btrim(new.provider_account_id) <> '' then
    v_decision := public.fraud_decide_subject('payout', 'connect-account:' || new.provider_account_id);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:payout';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function fraud_internal.guard_event_ticket_order_insert() from public, anon, authenticated;

drop trigger if exists fraud_guard_event_ticket_order_insert on public.event_ticket_orders;
create trigger fraud_guard_event_ticket_order_insert
before insert on public.event_ticket_orders
for each row execute function fraud_internal.guard_event_ticket_order_insert();

create or replace function fraud_internal.guard_experience_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_experience public.experiences;
  v_decision jsonb;
  v_velocity_count integer := 0;
  v_identity_key text;
begin
  select * into v_experience from public.experiences where id = new.experience_id;
  if v_experience.id is null then return new; end if;

  v_decision := public.fraud_decide_subject('experience', v_experience.id::text);
  if fraud_internal.decision_blocks_sensitive_action(v_decision) then
    raise exception using errcode = '42501', message = 'fraud_review_required:experience';
  end if;

  if v_experience.location_id is not null then
    v_decision := public.fraud_decide_subject('location', v_experience.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:location';
    end if;
  elsif v_experience.organization_id is not null then
    v_decision := public.fraud_decide_subject('organizer', v_experience.organization_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:organizer';
    end if;
  end if;

  if new.customer_user_id is not null then
    v_decision := public.fraud_decide_subject('user', new.customer_user_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:user';
    end if;

    v_identity_key := 'experience:user:' || new.customer_user_id::text;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.experience_bookings b
    where b.customer_user_id = new.customer_user_id
      and b.created_at >= now() - interval '15 minutes';
  elsif new.customer_email is not null and btrim(new.customer_email) <> '' then
    v_identity_key := 'experience:email:' || lower(btrim(new.customer_email));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.experience_bookings b
    where lower(btrim(b.customer_email)) = lower(btrim(new.customer_email))
      and b.created_at >= now() - interval '15 minutes';
  elsif new.customer_phone is not null
        and regexp_replace(new.customer_phone, '[^0-9]', '', 'g') <> '' then
    v_identity_key := 'experience:phone:' || regexp_replace(new.customer_phone, '[^0-9]', '', 'g');
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.experience_bookings b
    where regexp_replace(coalesce(b.customer_phone, ''), '[^0-9]', '', 'g') = regexp_replace(new.customer_phone, '[^0-9]', '', 'g')
      and b.created_at >= now() - interval '15 minutes';
  end if;

  if v_velocity_count >= 6 then
    raise exception using errcode = '42501', message = 'fraud_velocity_block:experience_booking';
  end if;

  return new;
end;
$$;
revoke all on function fraud_internal.guard_experience_booking_insert() from public, anon, authenticated;

drop trigger if exists fraud_guard_experience_booking_insert on public.experience_bookings;
create trigger fraud_guard_experience_booking_insert
before insert on public.experience_bookings
for each row execute function fraud_internal.guard_experience_booking_insert();

create or replace function fraud_internal.guard_location_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_decision jsonb;
  v_velocity_count integer := 0;
  v_identity_key text;
begin
  if new.location_id is not null then
    v_decision := public.fraud_decide_subject('location', new.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:location';
    end if;
  end if;

  if new.user_id is not null then
    v_decision := public.fraud_decide_subject('user', new.user_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception using errcode = '42501', message = 'fraud_review_required:user';
    end if;

    v_identity_key := 'reservation:user:' || new.user_id::text;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.location_reservations r
    where r.user_id = new.user_id
      and r.created_at >= now() - interval '15 minutes';
  elsif new.customer_email is not null and btrim(new.customer_email) <> '' then
    v_identity_key := 'reservation:email:' || lower(btrim(new.customer_email));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.location_reservations r
    where lower(btrim(r.customer_email)) = lower(btrim(new.customer_email))
      and r.created_at >= now() - interval '15 minutes';
  elsif new.customer_phone is not null
        and regexp_replace(new.customer_phone, '[^0-9]', '', 'g') <> '' then
    v_identity_key := 'reservation:phone:' || regexp_replace(new.customer_phone, '[^0-9]', '', 'g');
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_identity_key, 0));
    select count(*) into v_velocity_count
    from public.location_reservations r
    where regexp_replace(coalesce(r.customer_phone, ''), '[^0-9]', '', 'g') = regexp_replace(new.customer_phone, '[^0-9]', '', 'g')
      and r.created_at >= now() - interval '15 minutes';
  end if;

  if v_velocity_count >= 6 then
    raise exception using errcode = '42501', message = 'fraud_velocity_block:location_reservation';
  end if;

  return new;
end;
$$;
revoke all on function fraud_internal.guard_location_reservation_insert() from public, anon, authenticated;

drop trigger if exists fraud_guard_location_reservation_insert on public.location_reservations;
create trigger fraud_guard_location_reservation_insert
before insert on public.location_reservations
for each row execute function fraud_internal.guard_location_reservation_insert();

update public.fraud_rules
set configuration = coalesce(configuration, '{}'::jsonb) || '{"hard_block_threshold":7,"hard_block_window_minutes":15,"concurrency_guard":"advisory_xact_lock"}'::jsonb,
    updated_at = now()
where rule_key in ('ticket_order_velocity','experience_booking_velocity','reservation_velocity');
