insert into public.fraud_rules(rule_key,name,subject_type,category,description,default_score,severity,enabled,auto_case,configuration)
values
('claim_otp_bruteforce','Claim verification brute force','claim','account_takeover','Repeated incorrect OTP attempts against a business ownership verification challenge.',60,5,true,true,'{"attempt_threshold":5,"realtime":true}'::jsonb),
('claim_contact_mismatch','Claim contact mismatch','claim','account_takeover','A claim was OTP verified using a contact that does not match the business contact already on file.',30,3,true,false,'{"realtime":true}'::jsonb),
('claim_ip_velocity','Claim source velocity','claim','account_takeover','A hashed source IP is associated with multiple claim attempts or ownership requests.',45,4,true,true,'{"realtime":true}'::jsonb),
('payment_failure_velocity','Payment failure velocity','payment','payments','Repeated failed payment activity that may indicate card testing or abusive payment attempts.',25,3,true,false,'{"realtime":true}'::jsonb),
('payment_dispute','Payment dispute or chargeback','payment','payments','A Stripe payment entered dispute or chargeback status.',70,5,true,true,'{"realtime":true,"recommended_action":"review_and_hold"}'::jsonb),
('payout_failure','Payout failure','payout','payments','A connected-account payout failed or was returned and requires risk review.',55,4,true,true,'{"realtime":true,"recommended_action":"hold_payout"}'::jsonb)
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

create index if not exists location_claim_requests_user_created_idx
  on public.location_claim_requests(user_id, created_at desc) where user_id is not null;
create index if not exists location_claim_requests_email_created_idx
  on public.location_claim_requests((lower(btrim(owner_email))), created_at desc)
  where owner_email is not null and btrim(owner_email) <> '';
create index if not exists location_claim_requests_phone_created_idx
  on public.location_claim_requests((regexp_replace(owner_phone,'[^0-9]','','g')), created_at desc)
  where owner_phone is not null and btrim(owner_phone) <> '';
create index if not exists claim_verification_ip_created_idx
  on public.claim_verification_challenges(ip_hash, created_at desc) where ip_hash is not null;

create or replace function fraud_internal.on_claim_challenge_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_ip_count integer := 0;
begin
  if new.ip_hash is not null and btrim(new.ip_hash) <> '' then
    insert into public.fraud_identity_links(identity_type,identity_hash,subject_type,subject_id,source,confidence,last_seen_at,metadata)
    values ('ip_hash',new.ip_hash,'claim',new.id::text,'claim_verification',1.0,now(),jsonb_build_object('location_id',new.location_id))
    on conflict(identity_type,identity_hash,subject_type,subject_id)
    do update set last_seen_at=excluded.last_seen_at, metadata=excluded.metadata;

    select count(distinct c.id) into v_ip_count
    from public.claim_verification_challenges c
    where c.ip_hash = new.ip_hash and c.created_at >= now() - interval '60 minutes';

    if v_ip_count >= 3 then
      perform fraud_internal.emit_signal(
        'claim',new.id::text,'claim_ip_velocity','claim_ip_velocity','account_takeover','db_realtime',
        case when v_ip_count >= 6 then 5 else 4 end,
        case when v_ip_count >= 6 then 65 else 45 end,
        jsonb_build_object('claim_challenges_same_ip_60m',v_ip_count),
        'claim-ip-velocity:' || new.id::text || ':' || to_char(date_trunc('hour',now()),'YYYYMMDDHH24'),
        'location',new.location_id::text
      );
    end if;
  end if;

  if tg_op = 'UPDATE' and coalesce(new.attempt_count,0) >= 5 and coalesce(old.attempt_count,0) < 5 then
    perform fraud_internal.emit_signal(
      'claim',new.id::text,'claim_otp_bruteforce','otp_bruteforce','account_takeover','db_realtime',5,60,
      jsonb_build_object('attempt_count',new.attempt_count,'contact_match',new.contact_match),
      'claim-otp-bruteforce:' || new.id::text,
      'location',new.location_id::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_claim_challenge_change() from public, anon, authenticated;

drop trigger if exists fraud_realtime_claim_challenge on public.claim_verification_challenges;
create trigger fraud_realtime_claim_challenge
after insert or update of attempt_count, ip_hash, verified_at on public.claim_verification_challenges
for each row execute function fraud_internal.on_claim_challenge_change();

create or replace function fraud_internal.on_location_claim_request_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_actor_count integer := 0;
  v_ip_count integer := 0;
begin
  if new.user_id is not null then
    select count(*) into v_actor_count from public.location_claim_requests c
    where c.user_id=new.user_id and c.created_at >= now()-interval '60 minutes';
  elsif new.owner_email is not null and btrim(new.owner_email) <> '' then
    select count(*) into v_actor_count from public.location_claim_requests c
    where lower(btrim(c.owner_email))=lower(btrim(new.owner_email)) and c.created_at >= now()-interval '60 minutes';
  elsif new.owner_phone is not null and btrim(new.owner_phone) <> '' then
    select count(*) into v_actor_count from public.location_claim_requests c
    where regexp_replace(c.owner_phone,'[^0-9]','','g')=regexp_replace(new.owner_phone,'[^0-9]','','g') and c.created_at >= now()-interval '60 minutes';
  end if;

  if v_actor_count >= 3 then
    perform fraud_internal.emit_signal(
      'claim',new.id::text,'claim_velocity','claim_velocity','account_takeover','db_realtime',
      case when v_actor_count >= 6 then 5 else 4 end,
      case when v_actor_count >= 6 then 55 else 35 end,
      jsonb_build_object('claim_requests_actor_60m',v_actor_count),
      'location-claim-velocity:' || new.id::text,
      'location',new.location_id::text
    );
  end if;

  if coalesce(new.verified_contact_match,false)=false and new.verified_contact is not null then
    perform fraud_internal.emit_signal(
      'claim',new.id::text,'claim_contact_mismatch','verified_contact_mismatch','account_takeover','db_realtime',3,30,
      jsonb_build_object('verification_status',new.verification_status,'channel',new.verified_contact_channel),
      'claim-contact-mismatch:' || new.id::text,
      'location',new.location_id::text
    );
  end if;

  if new.submission_ip_hash is not null and btrim(new.submission_ip_hash) <> '' then
    insert into public.fraud_identity_links(identity_type,identity_hash,subject_type,subject_id,source,confidence,last_seen_at,metadata)
    values ('ip_hash',new.submission_ip_hash,'claim',new.id::text,'claim_submission',1.0,now(),jsonb_build_object('location_id',new.location_id))
    on conflict(identity_type,identity_hash,subject_type,subject_id)
    do update set last_seen_at=excluded.last_seen_at, metadata=excluded.metadata;

    select count(distinct c.id) into v_ip_count from public.location_claim_requests c
    where c.submission_ip_hash=new.submission_ip_hash and c.created_at >= now()-interval '60 minutes';
    if v_ip_count >= 3 then
      perform fraud_internal.emit_signal(
        'claim',new.id::text,'claim_ip_velocity','claim_ip_velocity','account_takeover','db_realtime',4,45,
        jsonb_build_object('claim_requests_same_ip_60m',v_ip_count),
        'claim-request-ip-velocity:' || new.id::text,
        'location',new.location_id::text
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_location_claim_request_insert() from public, anon, authenticated;

drop trigger if exists fraud_realtime_location_claim_request on public.location_claim_requests;
create trigger fraud_realtime_location_claim_request
after insert on public.location_claim_requests
for each row execute function fraud_internal.on_location_claim_request_insert();
