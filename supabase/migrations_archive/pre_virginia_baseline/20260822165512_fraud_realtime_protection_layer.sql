create schema if not exists fraud_internal;
revoke all on schema fraud_internal from public, anon, authenticated;

revoke execute on function public.fraud_recalculate_subject(text,text) from public, anon, authenticated;
revoke execute on function public.fraud_ensure_case(text,text,text) from public, anon, authenticated;
revoke execute on function public.fraud_after_signal() from public, anon, authenticated;
revoke execute on function public.fraud_apply_action_state() from public, anon, authenticated;
grant execute on function public.fraud_recalculate_subject(text,text) to service_role;
grant execute on function public.fraud_ensure_case(text,text,text) to service_role;

insert into public.fraud_rules(rule_key,name,subject_type,category,description,default_score,severity,auto_case,configuration)
values
('claim_velocity','Rapid claim attempts','claim','account_takeover','Multiple business claims from the same account or against the same location in a short window.',35,4,true,'{"window_minutes":60,"review_threshold":3}'::jsonb),
('reservation_velocity','Reservation velocity anomaly','reservation','abuse','Repeated reservations using the same contact details in a short period across the platform.',25,3,true,'{"window_minutes":15,"review_threshold":5}'::jsonb),
('location_owner_change','Location ownership change','location','account_takeover','A previously owned location changed to a different owner account.',45,4,true,'{"realtime":true}'::jsonb),
('payout_destination_change','Payout destination change','location','payments','A connected payout account changed after one was already established.',65,5,true,'{"realtime":true,"recommended_action":"hold_payout"}'::jsonb),
('event_material_change','Material event change after publication','event','content_integrity','A published or searchable event changed material venue, timing, price, or ticketing destination fields.',25,3,true,'{"realtime":true}'::jsonb),
('experience_material_change','Material experience change after publication','experience','content_integrity','A published or searchable experience changed material venue, price, or booking details.',25,3,true,'{"realtime":true}'::jsonb)
on conflict (rule_key) do update set
  name=excluded.name,
  subject_type=excluded.subject_type,
  category=excluded.category,
  description=excluded.description,
  default_score=excluded.default_score,
  severity=excluded.severity,
  auto_case=excluded.auto_case,
  configuration=excluded.configuration,
  enabled=true,
  updated_at=now();

create or replace function fraud_internal.emit_signal(
  p_subject_type text,
  p_subject_id text,
  p_rule_key text,
  p_signal_type text,
  p_category text,
  p_source text,
  p_severity smallint,
  p_score_delta integer,
  p_evidence jsonb,
  p_dedupe_key text,
  p_related_subject_type text default null,
  p_related_subject_id text default null
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
begin
  insert into public.fraud_signals(
    subject_type, subject_id, related_subject_type, related_subject_id,
    rule_key, signal_type, category, source, severity, score_delta,
    confidence, evidence, dedupe_key, observed_at
  ) values (
    p_subject_type, p_subject_id, p_related_subject_type, p_related_subject_id,
    p_rule_key, p_signal_type, p_category, p_source,
    greatest(1, least(5, p_severity)), greatest(-100, least(100, p_score_delta)),
    1.0, coalesce(p_evidence,'{}'::jsonb), p_dedupe_key, now()
  ) on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
revoke all on function fraud_internal.emit_signal(text,text,text,text,text,text,smallint,integer,jsonb,text,text,text) from public, anon, authenticated;

create or replace function fraud_internal.on_business_claim_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_actor_count integer := 0;
  v_location_count integer := 0;
  v_score integer;
  v_severity smallint;
begin
  if new.user_id is not null then
    select count(*) into v_actor_count
    from public.business_claims c
    where c.user_id = new.user_id
      and c.created_at >= now() - interval '60 minutes';
  elsif new.owner_email is not null and btrim(new.owner_email) <> '' then
    select count(*) into v_actor_count
    from public.business_claims c
    where lower(btrim(c.owner_email)) = lower(btrim(new.owner_email))
      and c.created_at >= now() - interval '60 minutes';
  end if;

  select count(*) into v_location_count
  from public.business_claims c
  where c.location_id = new.location_id
    and c.created_at >= now() - interval '24 hours';

  if v_actor_count >= 3 or v_location_count >= 3 then
    v_severity := case when v_actor_count >= 6 or v_location_count >= 5 then 5 else 4 end;
    v_score := case when v_severity = 5 then 55 else 35 end;

    perform fraud_internal.emit_signal(
      'claim', new.id::text, 'claim_velocity', 'claim_velocity', 'account_takeover',
      'db_realtime', v_severity, v_score,
      jsonb_build_object('actor_claims_60m',v_actor_count,'location_claims_24h',v_location_count),
      'claim-velocity:' || new.id::text,
      'location', new.location_id::text
    );

    if new.user_id is not null then
      perform fraud_internal.emit_signal(
        'user', new.user_id::text, 'claim_velocity', 'claim_velocity', 'account_takeover',
        'db_realtime', v_severity, v_score,
        jsonb_build_object('actor_claims_60m',v_actor_count,'location_claims_24h',v_location_count),
        'claim-user-velocity:' || new.user_id::text || ':' || to_char(date_trunc('hour',now()),'YYYYMMDDHH24'),
        'claim', new.id::text
      );
    end if;

    if v_location_count >= 3 then
      perform fraud_internal.emit_signal(
        'location', new.location_id::text, 'claim_takeover_attempt', 'claim_takeover_attempt', 'account_takeover',
        'db_realtime', v_severity, v_score,
        jsonb_build_object('claim_attempts_24h',v_location_count),
        'claim-location-burst:' || new.location_id::text || ':' || to_char(date_trunc('day',now()),'YYYYMMDD'),
        'claim', new.id::text
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_business_claim_insert() from public, anon, authenticated;

drop trigger if exists fraud_realtime_claim_insert on public.business_claims;
create trigger fraud_realtime_claim_insert
after insert on public.business_claims
for each row execute function fraud_internal.on_business_claim_insert();

create or replace function fraud_internal.on_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_count integer := 0;
  v_score integer;
  v_severity smallint;
begin
  select count(*) into v_count
  from public.reservations r
  where r.created_at >= now() - interval '15 minutes'
    and r.id <> new.id
    and (
      (new.email is not null and btrim(new.email) <> '' and lower(btrim(r.email)) = lower(btrim(new.email)))
      or
      (new.phone is not null and btrim(new.phone) <> '' and regexp_replace(coalesce(r.phone,''),'[^0-9]','','g') = regexp_replace(new.phone,'[^0-9]','','g'))
    );
  v_count := v_count + 1;

  if v_count >= 5 then
    v_severity := case when v_count >= 10 then 5 when v_count >= 7 then 4 else 3 end;
    v_score := case when v_severity = 5 then 55 when v_severity = 4 then 40 else 25 end;
    perform fraud_internal.emit_signal(
      'reservation', new.id::text, 'reservation_velocity', 'reservation_velocity', 'abuse',
      'db_realtime', v_severity, v_score,
      jsonb_build_object('matching_contact_reservations_15m',v_count),
      'reservation-velocity:' || new.id::text,
      'location', new.location_id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_reservation_insert() from public, anon, authenticated;

drop trigger if exists fraud_realtime_reservation_insert on public.reservations;
create trigger fraud_realtime_reservation_insert
after insert on public.reservations
for each row execute function fraud_internal.on_reservation_insert();

create or replace function fraud_internal.on_location_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
begin
  if old.owner_user_id is not null and new.owner_user_id is distinct from old.owner_user_id then
    perform fraud_internal.emit_signal(
      'location', new.id::text, 'location_owner_change', 'ownership_change', 'account_takeover',
      'db_realtime', 4, 45,
      jsonb_build_object('owner_changed',true),
      'location-owner-change:' || new.id::text || ':' || txid_current()::text
    );
  end if;

  if old.stripe_connect_account_id is not null
     and new.stripe_connect_account_id is distinct from old.stripe_connect_account_id then
    perform fraud_internal.emit_signal(
      'location', new.id::text, 'payout_destination_change', 'payout_destination_change', 'payments',
      'db_realtime', 5, 65,
      jsonb_build_object('payout_destination_changed',true),
      'location-payout-change:' || new.id::text || ':' || txid_current()::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_location_sensitive_update() from public, anon, authenticated;

drop trigger if exists fraud_realtime_location_sensitive_update on public.locations;
create trigger fraud_realtime_location_sensitive_update
after update of owner_user_id, stripe_connect_account_id on public.locations
for each row execute function fraud_internal.on_location_sensitive_update();

create or replace function fraud_internal.on_event_material_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
begin
  if (coalesce(old.searchable,false) or lower(coalesce(old.status,'')) in ('published','active','live','approved'))
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

drop trigger if exists fraud_realtime_event_material_update on public.events;
create trigger fraud_realtime_event_material_update
after update of location_id, starts_at, ends_at, price_min, price_max, external_url, capacity, status, searchable on public.events
for each row execute function fraud_internal.on_event_material_update();

create or replace function fraud_internal.on_experience_material_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
begin
  if (coalesce(old.searchable,false) or lower(coalesce(old.status,'')) in ('published','active','live','approved'))
     and (
       new.location_id is distinct from old.location_id
       or new.price_per_person is distinct from old.price_per_person
       or new.max_party_size is distinct from old.max_party_size
       or new.address is distinct from old.address
     ) then
    perform fraud_internal.emit_signal(
      'experience', new.id::text, 'experience_material_change', 'material_change_after_publish', 'content_integrity',
      'db_realtime', 3, 25,
      jsonb_build_object(
        'location_changed',new.location_id is distinct from old.location_id,
        'price_changed',new.price_per_person is distinct from old.price_per_person,
        'party_size_changed',new.max_party_size is distinct from old.max_party_size,
        'address_changed',new.address is distinct from old.address
      ),
      'experience-material-change:' || new.id::text || ':' || txid_current()::text,
      'location', new.location_id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_experience_material_update() from public, anon, authenticated;

drop trigger if exists fraud_realtime_experience_material_update on public.experiences;
create trigger fraud_realtime_experience_material_update
after update of location_id, price_per_person, max_party_size, address, status, searchable on public.experiences
for each row execute function fraud_internal.on_experience_material_update();
