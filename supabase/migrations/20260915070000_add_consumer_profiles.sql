create table if not exists public.consumer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text,
  birth_month smallint,
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  sms_consent_source text,
  sms_consent_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumer_profiles_birth_month_check check (birth_month is null or birth_month between 1 and 12),
  constraint consumer_profiles_sms_consent_audit_check check (
    (sms_consent = false and sms_consent_at is null)
    or
    (sms_consent = true and sms_consent_at is not null and coalesce(trim(sms_consent_source), '') <> '' and coalesce(trim(sms_consent_text), '') <> '')
  )
);

alter table public.consumer_profiles enable row level security;

revoke all on table public.consumer_profiles from public, anon;
grant select, insert, update on table public.consumer_profiles to authenticated;
grant all on table public.consumer_profiles to service_role;

drop policy if exists consumer_profiles_select_own on public.consumer_profiles;
create policy consumer_profiles_select_own
on public.consumer_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists consumer_profiles_insert_own on public.consumer_profiles;
create policy consumer_profiles_insert_own
on public.consumer_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists consumer_profiles_update_own on public.consumer_profiles;
create policy consumer_profiles_update_own
on public.consumer_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists consumer_profiles_sms_consent_idx
  on public.consumer_profiles (sms_consent, sms_consent_at desc)
  where sms_consent = true;

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
    phone_e164,
    birth_month,
    sms_consent,
    sms_consent_at,
    sms_consent_source,
    sms_consent_text,
    updated_at
  ) values (
    new.id,
    nullif(trim(meta ->> 'phone_e164'), ''),
    month_value,
    consent_value,
    case when consent_value then now() else null end,
    case when consent_value then 'mobile_account_signup' else null end,
    case when consent_value then consent_copy else null end,
    now()
  )
  on conflict (user_id) do update set
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

drop trigger if exists sync_consumer_profile_after_auth_user_change on auth.users;
create trigger sync_consumer_profile_after_auth_user_change
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_consumer_profile_from_auth_metadata();
