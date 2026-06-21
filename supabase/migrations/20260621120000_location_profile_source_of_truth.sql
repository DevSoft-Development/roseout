alter table if exists public.locations
  add column if not exists profile_managed_by text not null default 'system',
  add column if not exists profile_manual_lock boolean not null default false,
  add column if not exists profile_owner_verified_at timestamptz null,
  add column if not exists profile_last_owner_update_at timestamptz null,
  add column if not exists profile_last_admin_update_at timestamptz null,
  add column if not exists profile_field_sources jsonb not null default '{}'::jsonb;

alter table if exists public.locations
  drop constraint if exists locations_profile_managed_by_check;

alter table if exists public.locations
  add constraint locations_profile_managed_by_check
  check (profile_managed_by in ('system', 'import', 'google', 'admin', 'owner'));

create index if not exists idx_locations_profile_managed_by
  on public.locations (profile_managed_by);

create index if not exists idx_locations_profile_manual_lock
  on public.locations (profile_manual_lock)
  where profile_manual_lock = true;

comment on column public.locations.profile_managed_by is 'Profile source of truth: system/import/google starter data, or admin/owner manually managed data.';
comment on column public.locations.profile_manual_lock is 'When true, automated import/backfill jobs must not overwrite public-facing profile fields.';
comment on column public.locations.profile_field_sources is 'Optional per-field source map for public profile data, e.g. {"operating_hours":"owner","phone":"admin"}.';

create or replace function public.get_location_hours_repair_candidates(max_rows integer default 100)
returns table (
  id uuid,
  operating_hours jsonb,
  google_regular_opening_hours jsonb,
  hours_raw jsonb,
  profile_managed_by text,
  profile_manual_lock boolean,
  is_claimed boolean,
  claimed boolean,
  claim_status text,
  created_at timestamptz,
  hours_last_backfilled_at timestamptz
)
language sql
stable
as $$
  select
    l.id,
    l.operating_hours,
    l.google_regular_opening_hours,
    l.hours_raw,
    l.profile_managed_by,
    l.profile_manual_lock,
    l.is_claimed,
    l.claimed,
    l.claim_status,
    l.created_at,
    l.hours_last_backfilled_at
  from public.locations l
  where l.google_regular_opening_hours is not null
    and (
      l.operating_hours is null
      or l.operating_hours::text in ('{}', '[]', 'null', '"null"', '"{}"', '"[]"', '{"monday": "9am-5pm"}', '{"Monday": "9am-5pm"}', '{"monday":"9am-5pm"}', '{"Monday":"9am-5pm"}')
    )
  order by l.hours_last_backfilled_at asc nulls first, l.created_at asc nulls first, l.id asc
  limit greatest(1, least(coalesce(max_rows, 100), 1000));
$$;
