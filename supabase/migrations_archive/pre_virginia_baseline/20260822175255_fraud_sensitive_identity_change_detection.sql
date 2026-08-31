insert into public.fraud_rules(rule_key,name,subject_type,category,description,default_score,severity,enabled,auto_case,configuration)
values
('organizer_payout_destination_change','Organizer payout destination change','organizer','payments','An organizer changed an established connected payout account.',65,5,true,true,'{"realtime":true,"recommended_action":"hold_payout"}'::jsonb)
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

create or replace function fraud_internal.on_location_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_contact_change boolean := false;
  v_owner_contact_change boolean := false;
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

  v_owner_contact_change :=
    (old.owner_email is not null and new.owner_email is distinct from old.owner_email)
    or (old.owner_phone is not null and new.owner_phone is distinct from old.owner_phone)
    or (old.claimed_by_email is not null and new.claimed_by_email is distinct from old.claimed_by_email);

  v_contact_change := v_owner_contact_change
    or (old.phone is not null and new.phone is distinct from old.phone)
    or (old.website is not null and new.website is distinct from old.website)
    or (old.website_url is not null and new.website_url is distinct from old.website_url)
    or (old.reservation_owner_email is not null and new.reservation_owner_email is distinct from old.reservation_owner_email)
    or (old.reservation_phone is not null and new.reservation_phone is distinct from old.reservation_phone);

  if v_contact_change then
    perform fraud_internal.emit_signal(
      'location', new.id::text, 'location_contact_anomaly', 'sensitive_contact_change', 'account_takeover',
      'db_realtime', 3, case when v_owner_contact_change then 30 else 20 end,
      jsonb_build_object(
        'owner_email_changed', old.owner_email is not null and new.owner_email is distinct from old.owner_email,
        'owner_phone_changed', old.owner_phone is not null and new.owner_phone is distinct from old.owner_phone,
        'claimed_by_email_changed', old.claimed_by_email is not null and new.claimed_by_email is distinct from old.claimed_by_email,
        'public_phone_changed', old.phone is not null and new.phone is distinct from old.phone,
        'website_changed', (old.website is not null and new.website is distinct from old.website) or (old.website_url is not null and new.website_url is distinct from old.website_url),
        'reservation_contact_changed', (old.reservation_owner_email is not null and new.reservation_owner_email is distinct from old.reservation_owner_email) or (old.reservation_phone is not null and new.reservation_phone is distinct from old.reservation_phone)
      ),
      'location-contact-change:' || new.id::text || ':' || txid_current()::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_location_sensitive_update() from public, anon, authenticated;

drop trigger if exists fraud_realtime_location_sensitive_update on public.locations;
create trigger fraud_realtime_location_sensitive_update
after update of owner_user_id, stripe_connect_account_id, owner_email, owner_phone, claimed_by_email, phone, website, website_url, reservation_owner_email, reservation_phone on public.locations
for each row execute function fraud_internal.on_location_sensitive_update();

create or replace function fraud_internal.on_organization_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
begin
  if old.stripe_connect_account_id is not null
     and new.stripe_connect_account_id is distinct from old.stripe_connect_account_id then
    perform fraud_internal.emit_signal(
      'organizer', new.id::text, 'organizer_payout_destination_change', 'payout_destination_change', 'payments',
      'db_realtime', 5, 65,
      jsonb_build_object('payout_destination_changed',true),
      'organizer-payout-change:' || new.id::text || ':' || txid_current()::text
    );
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.on_organization_sensitive_update() from public, anon, authenticated;

drop trigger if exists fraud_realtime_organization_sensitive_update on public.organizations;
create trigger fraud_realtime_organization_sensitive_update
after update of stripe_connect_account_id on public.organizations
for each row execute function fraud_internal.on_organization_sensitive_update();
