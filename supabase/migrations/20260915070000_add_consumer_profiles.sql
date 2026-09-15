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
