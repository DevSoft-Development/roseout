create index if not exists business_claims_user_created_idx
  on public.business_claims (user_id, created_at desc)
  where user_id is not null;

create index if not exists business_claims_owner_email_created_idx
  on public.business_claims ((lower(btrim(owner_email))), created_at desc)
  where owner_email is not null and btrim(owner_email) <> '';

create index if not exists reservations_email_created_idx
  on public.reservations ((lower(btrim(email))), created_at desc)
  where email is not null and btrim(email) <> '';

create index if not exists reservations_phone_created_idx
  on public.reservations ((regexp_replace(phone,'[^0-9]','','g')), created_at desc)
  where phone is not null and btrim(phone) <> '';

create index if not exists fraud_reports_subject_created_idx
  on public.fraud_reports (subject_type, subject_id, created_at desc);

create index if not exists fraud_identity_lookup_recent_idx
  on public.fraud_identity_links (identity_type, identity_hash, last_seen_at desc);

create index if not exists fraud_subjects_risk_queue_idx
  on public.fraud_subjects (risk_band, risk_score desc, updated_at desc);

create or replace function fraud_internal.on_business_claim_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_actor_count integer := 0;
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

  if v_actor_count >= 3 then
    v_severity := case when v_actor_count >= 6 then 5 else 4 end;
    v_score := case when v_severity = 5 then 55 else 35 end;

    perform fraud_internal.emit_signal(
      'claim', new.id::text, 'claim_velocity', 'claim_velocity', 'account_takeover',
      'db_realtime', v_severity, v_score,
      jsonb_build_object('actor_claims_60m',v_actor_count),
      'claim-velocity:' || new.id::text,
      'location', new.location_id::text
    );

    if new.user_id is not null then
      perform fraud_internal.emit_signal(
        'user', new.user_id::text, 'claim_velocity', 'claim_velocity', 'account_takeover',
        'db_realtime', v_severity, v_score,
        jsonb_build_object('actor_claims_60m',v_actor_count),
        'claim-user-velocity:' || new.user_id::text || ':' || to_char(date_trunc('hour',now()),'YYYYMMDDHH24'),
        'claim', new.id::text
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_business_claim_insert() from public, anon, authenticated;

create or replace function fraud_internal.on_reservation_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_email_count integer := 0;
  v_phone_count integer := 0;
  v_count integer := 0;
  v_score integer;
  v_severity smallint;
begin
  if new.email is not null and btrim(new.email) <> '' then
    select count(*) into v_email_count
    from public.reservations r
    where r.created_at >= now() - interval '15 minutes'
      and r.id <> new.id
      and lower(btrim(r.email)) = lower(btrim(new.email));
    v_email_count := v_email_count + 1;
  end if;

  if new.phone is not null and btrim(new.phone) <> '' then
    select count(*) into v_phone_count
    from public.reservations r
    where r.created_at >= now() - interval '15 minutes'
      and r.id <> new.id
      and regexp_replace(r.phone,'[^0-9]','','g') = regexp_replace(new.phone,'[^0-9]','','g');
    v_phone_count := v_phone_count + 1;
  end if;

  v_count := greatest(v_email_count, v_phone_count);

  if v_count >= 5 then
    v_severity := case when v_count >= 10 then 5 when v_count >= 7 then 4 else 3 end;
    v_score := case when v_severity = 5 then 55 when v_severity = 4 then 40 else 25 end;
    perform fraud_internal.emit_signal(
      'reservation', new.id::text, 'reservation_velocity', 'reservation_velocity', 'abuse',
      'db_realtime', v_severity, v_score,
      jsonb_build_object('matching_email_15m',v_email_count,'matching_phone_15m',v_phone_count),
      'reservation-velocity:' || new.id::text,
      'location', new.location_id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_reservation_insert() from public, anon, authenticated;
