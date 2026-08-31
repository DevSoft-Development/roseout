alter table public.location_search_profiles
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid,
  add column if not exists verification_source text,
  add column if not exists verification_note text;

create index if not exists location_search_profiles_verified_at_idx
  on public.location_search_profiles (verified_at desc)
  where verified_at is not null;

comment on column public.location_search_profiles.verified_at is 'Timestamp when an admin verified the canonical search profile.';
comment on column public.location_search_profiles.verified_by is 'Authenticated admin user id that verified the profile.';
comment on column public.location_search_profiles.verification_source is 'Verification path, such as bulk_admin or bulk_admin_override.';
comment on column public.location_search_profiles.verification_note is 'Optional administrative reason for an override verification.';