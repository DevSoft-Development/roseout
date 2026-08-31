insert into public.fraud_rules(rule_key,name,subject_type,category,description,default_score,severity,enabled,auto_case,configuration)
values
('ticket_order_velocity','Ticket order velocity','order','payments','Repeated ticket orders from the same user or contact identity in a short period.',35,4,true,true,'{"window_minutes":15,"review_threshold":5,"realtime":true}'::jsonb),
('experience_booking_velocity','Experience booking velocity','reservation','abuse','Repeated experience bookings from the same user or contact identity in a short period.',30,3,true,true,'{"window_minutes":15,"review_threshold":5,"realtime":true}'::jsonb)
on conflict (rule_key) do update set
  name=excluded.name,
  subject_type=excluded.subject_type,
  category=excluded.category,
  description=excluded.description,
  default_score=excluded.default_score,
  severity=excluded.severity,
  enabled=true,
  auto_case=excluded.auto_case,
  configuration=excluded.configuration,
  updated_at=now();

create index if not exists location_reservations_user_created_fraud_idx
  on public.location_reservations(user_id, created_at desc) where user_id is not null;
create index if not exists location_reservations_email_created_fraud_idx
  on public.location_reservations((lower(btrim(customer_email))), created_at desc)
  where customer_email is not null and btrim(customer_email) <> '';
create index if not exists location_reservations_phone_created_fraud_idx
  on public.location_reservations((regexp_replace(customer_phone,'[^0-9]','','g')), created_at desc)
  where customer_phone is not null and btrim(customer_phone) <> '';

create index if not exists event_ticket_orders_user_created_fraud_idx
  on public.event_ticket_orders(purchaser_user_id, created_at desc) where purchaser_user_id is not null;
create index if not exists event_ticket_orders_email_created_fraud_idx
  on public.event_ticket_orders((lower(btrim(purchaser_email))), created_at desc)
  where purchaser_email is not null and btrim(purchaser_email) <> '';
create index if not exists event_ticket_orders_phone_created_fraud_idx
  on public.event_ticket_orders((regexp_replace(purchaser_phone,'[^0-9]','','g')), created_at desc)
  where purchaser_phone is not null and btrim(purchaser_phone) <> '';

create index if not exists experience_bookings_user_created_fraud_idx
  on public.experience_bookings(customer_user_id, created_at desc) where customer_user_id is not null;
create index if not exists experience_bookings_email_created_fraud_idx
  on public.experience_bookings((lower(btrim(customer_email))), created_at desc)
  where customer_email is not null and btrim(customer_email) <> '';
create index if not exists experience_bookings_phone_created_fraud_idx
  on public.experience_bookings((regexp_replace(customer_phone,'[^0-9]','','g')), created_at desc)
  where customer_phone is not null and btrim(customer_phone) <> '';

create or replace function fraud_internal.on_location_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_count integer := 0;
  v_severity smallint;
  v_score integer;
  v_bucket text;
begin
  if new.user_id is not null then
    select count(*) into v_count from public.location_reservations r
    where r.user_id=new.user_id and r.created_at >= now()-interval '15 minutes';
  elsif new.customer_email is not null and btrim(new.customer_email) <> '' then
    select count(*) into v_count from public.location_reservations r
    where lower(btrim(r.customer_email))=lower(btrim(new.customer_email)) and r.created_at >= now()-interval '15 minutes';
  elsif new.customer_phone is not null and btrim(new.customer_phone) <> '' then
    select count(*) into v_count from public.location_reservations r
    where regexp_replace(r.customer_phone,'[^0-9]','','g')=regexp_replace(new.customer_phone,'[^0-9]','','g') and r.created_at >= now()-interval '15 minutes';
  end if;

  if v_count >= 5 then
    v_severity := case when v_count >= 10 then 5 when v_count >= 7 then 4 else 3 end;
    v_score := case when v_severity=5 then 55 when v_severity=4 then 40 else 25 end;
    perform fraud_internal.emit_signal(
      'reservation',new.id::text,'reservation_velocity','reservation_velocity','abuse','db_realtime',
      v_severity,v_score,jsonb_build_object('matching_reservations_15m',v_count),
      'location-reservation-velocity:' || new.id::text,
      'location',new.location_id::text
    );

    if new.user_id is not null then
      v_bucket := to_char(now(),'YYYYMMDDHH24') || ':' || ((extract(minute from now())::int / 15)::text);
      perform fraud_internal.emit_signal(
        'user',new.user_id::text,'user_velocity','reservation_velocity','account_integrity','db_realtime',
        v_severity,v_score,jsonb_build_object('matching_reservations_15m',v_count),
        'user-location-reservation-velocity:' || new.user_id::text || ':' || v_bucket,
        'reservation',new.id::text
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_location_reservation_insert() from public, anon, authenticated;
drop trigger if exists fraud_realtime_location_reservation_insert on public.location_reservations;
create trigger fraud_realtime_location_reservation_insert
after insert on public.location_reservations
for each row execute function fraud_internal.on_location_reservation_insert();

create or replace function fraud_internal.on_event_ticket_order_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_count integer := 0;
  v_severity smallint;
  v_score integer;
  v_bucket text;
begin
  if new.purchaser_user_id is not null then
    select count(*) into v_count from public.event_ticket_orders o
    where o.purchaser_user_id=new.purchaser_user_id and o.created_at >= now()-interval '15 minutes';
  elsif new.purchaser_email is not null and btrim(new.purchaser_email) <> '' then
    select count(*) into v_count from public.event_ticket_orders o
    where lower(btrim(o.purchaser_email))=lower(btrim(new.purchaser_email)) and o.created_at >= now()-interval '15 minutes';
  elsif new.purchaser_phone is not null and btrim(new.purchaser_phone) <> '' then
    select count(*) into v_count from public.event_ticket_orders o
    where regexp_replace(o.purchaser_phone,'[^0-9]','','g')=regexp_replace(new.purchaser_phone,'[^0-9]','','g') and o.created_at >= now()-interval '15 minutes';
  end if;

  if v_count >= 5 then
    v_severity := case when v_count >= 10 then 5 when v_count >= 7 then 4 else 3 end;
    v_score := case when v_severity=5 then 60 when v_severity=4 then 45 else 30 end;
    perform fraud_internal.emit_signal(
      'order',new.id::text,'ticket_order_velocity','ticket_order_velocity','payments','db_realtime',
      v_severity,v_score,jsonb_build_object('matching_ticket_orders_15m',v_count),
      'ticket-order-velocity:' || new.id::text,
      'event',new.event_id::text
    );

    if new.purchaser_user_id is not null then
      v_bucket := to_char(now(),'YYYYMMDDHH24') || ':' || ((extract(minute from now())::int / 15)::text);
      perform fraud_internal.emit_signal(
        'user',new.purchaser_user_id::text,'user_velocity','ticket_order_velocity','account_integrity','db_realtime',
        v_severity,v_score,jsonb_build_object('matching_ticket_orders_15m',v_count),
        'user-ticket-order-velocity:' || new.purchaser_user_id::text || ':' || v_bucket,
        'order',new.id::text
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_event_ticket_order_insert() from public, anon, authenticated;
drop trigger if exists fraud_realtime_event_ticket_order_insert on public.event_ticket_orders;
create trigger fraud_realtime_event_ticket_order_insert
after insert on public.event_ticket_orders
for each row execute function fraud_internal.on_event_ticket_order_insert();

create or replace function fraud_internal.on_experience_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_count integer := 0;
  v_severity smallint;
  v_score integer;
  v_bucket text;
begin
  if new.customer_user_id is not null then
    select count(*) into v_count from public.experience_bookings b
    where b.customer_user_id=new.customer_user_id and b.created_at >= now()-interval '15 minutes';
  elsif new.customer_email is not null and btrim(new.customer_email) <> '' then
    select count(*) into v_count from public.experience_bookings b
    where lower(btrim(b.customer_email))=lower(btrim(new.customer_email)) and b.created_at >= now()-interval '15 minutes';
  elsif new.customer_phone is not null and btrim(new.customer_phone) <> '' then
    select count(*) into v_count from public.experience_bookings b
    where regexp_replace(b.customer_phone,'[^0-9]','','g')=regexp_replace(new.customer_phone,'[^0-9]','','g') and b.created_at >= now()-interval '15 minutes';
  end if;

  if v_count >= 5 then
    v_severity := case when v_count >= 10 then 5 when v_count >= 7 then 4 else 3 end;
    v_score := case when v_severity=5 then 55 when v_severity=4 then 40 else 30 end;
    perform fraud_internal.emit_signal(
      'reservation',new.id::text,'experience_booking_velocity','experience_booking_velocity','abuse','db_realtime',
      v_severity,v_score,jsonb_build_object('matching_experience_bookings_15m',v_count),
      'experience-booking-velocity:' || new.id::text,
      'experience',new.experience_id::text
    );

    if new.customer_user_id is not null then
      v_bucket := to_char(now(),'YYYYMMDDHH24') || ':' || ((extract(minute from now())::int / 15)::text);
      perform fraud_internal.emit_signal(
        'user',new.customer_user_id::text,'user_velocity','experience_booking_velocity','account_integrity','db_realtime',
        v_severity,v_score,jsonb_build_object('matching_experience_bookings_15m',v_count),
        'user-experience-booking-velocity:' || new.customer_user_id::text || ':' || v_bucket,
        'reservation',new.id::text
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_experience_booking_insert() from public, anon, authenticated;
drop trigger if exists fraud_realtime_experience_booking_insert on public.experience_bookings;
create trigger fraud_realtime_experience_booking_insert
after insert on public.experience_bookings
for each row execute function fraud_internal.on_experience_booking_insert();

create or replace function fraud_internal.on_event_material_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
begin
  if (coalesce(old.searchable,false) or lower(coalesce(old.status,'')) in ('scheduled','published','active','live','approved'))
     and (
       new.location_id is distinct from old.location_id
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.price_min is distinct from old.price_min
       or new.price_max is distinct from old.price_max
       or new.external_url is distinct from old.external_url
       or new.capacity is distinct from old.capacity
     ) then
    perform fraud_internal.emit_signal(
      'event', new.id::text, 'event_material_change', 'material_change_after_publish', 'content_integrity',
      'db_realtime', 3, 25,
      jsonb_build_object(
        'location_changed',new.location_id is distinct from old.location_id,
        'time_changed',(new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at),
        'price_changed',(new.price_min is distinct from old.price_min or new.price_max is distinct from old.price_max),
        'ticket_url_changed',new.external_url is distinct from old.external_url,
        'capacity_changed',new.capacity is distinct from old.capacity
      ),
      'event-material-change:' || new.id::text || ':' || txid_current()::text,
      'location', new.location_id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_event_material_update() from public, anon, authenticated;
