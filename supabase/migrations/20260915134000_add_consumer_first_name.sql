alter table public.consumer_profiles
  add column if not exists first_name text;

alter table public.consumer_profiles
  drop constraint if exists consumer_profiles_first_name_check;

alter table public.consumer_profiles
  add constraint consumer_profiles_first_name_check
  check (first_name is null or char_length(trim(first_name)) between 1 and 80);

create or replace function public.sync_consumer_profile_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  month_value smallint := null;
  consent_copy text := nullif(trim(meta ->> 'sms_consent_text'), '');
  consent_value boolean := false;
begin
  if coalesce(meta ->> 'birth_month', '') ~ '^(?:[1-9]|1[0-2])$' then
    month_value := (meta ->> 'birth_month')::smallint;
  end if;

  consent_value := coalesce((meta ->> 'sms_consent')::boolean, false) and consent_copy is not null;

  insert into public.consumer_profiles (
    user_id,
    first_name,
    phone_e164,
    birth_month,
    sms_consent,
    sms_consent_at,
    sms_consent_source,
    sms_consent_text,
    updated_at
  ) values (
    new.id,
    nullif(trim(meta ->> 'first_name'), ''),
    nullif(trim(meta ->> 'phone_e164'), ''),
    month_value,
    consent_value,
    case when consent_value then now() else null end,
    case when consent_value then 'mobile_account_signup' else null end,
    case when consent_value then consent_copy else null end,
    now()
  )
  on conflict (user_id) do update set
    first_name = coalesce(excluded.first_name, consumer_profiles.first_name),
    phone_e164 = coalesce(excluded.phone_e164, consumer_profiles.phone_e164),
    birth_month = coalesce(excluded.birth_month, consumer_profiles.birth_month),
    sms_consent = excluded.sms_consent,
    sms_consent_at = case
      when excluded.sms_consent and consumer_profiles.sms_consent_at is null then now()
      when excluded.sms_consent then consumer_profiles.sms_consent_at
      else null
    end,
    sms_consent_source = case when excluded.sms_consent then 'mobile_account_signup' else null end,
    sms_consent_text = case when excluded.sms_consent then excluded.sms_consent_text else null end,
    updated_at = now();

  return new;
end;
$$;

revoke execute on function public.sync_consumer_profile_from_auth_metadata() from PUBLIC, anon, authenticated;
grant execute on function public.sync_consumer_profile_from_auth_metadata() to service_role;
