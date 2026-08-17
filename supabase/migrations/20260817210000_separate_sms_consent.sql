-- Separate account/service SMS state from explicit marketing consent.
-- Legacy sms_opt_in values are intentionally not promoted into marketing consent because
-- the historical signup checkbox bundled transactional and promotional messaging.

alter table public.user_profiles
  add column if not exists transactional_sms_enabled boolean not null default true,
  add column if not exists marketing_sms_opt_in boolean not null default false,
  add column if not exists marketing_sms_opt_in_at timestamptz;

-- A profile without a phone number cannot receive transactional SMS.
update public.user_profiles
set transactional_sms_enabled = false
where coalesce(nullif(trim(mobile_number), ''), nullif(trim(phone), '')) is null;

comment on column public.user_profiles.transactional_sms_enabled is
  'Whether service/transactional SMS may be sent to the profile phone number. This is not marketing consent.';
comment on column public.user_profiles.marketing_sms_opt_in is
  'Explicit, optional consent for recurring marketing/promotional SMS. Never infer from legacy sms_opt_in.';
comment on column public.user_profiles.marketing_sms_opt_in_at is
  'Timestamp of the explicit marketing SMS opt-in event.';
