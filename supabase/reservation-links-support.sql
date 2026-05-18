-- Adds external and internal reservation support without dropping or overwriting data.

alter table if exists public.locations
  add column if not exists reservation_url text,
  add column if not exists reservation_link text,
  add column if not exists booking_url text,
  add column if not exists website text,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists uses_internal_reservations boolean default false,
  add column if not exists internal_reservations_enabled boolean default false,
  add column if not exists reservation_source text default 'external';

alter table if exists public.restaurants
  add column if not exists reservation_url text,
  add column if not exists reservation_link text,
  add column if not exists booking_url text,
  add column if not exists website text,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists uses_internal_reservations boolean default false,
  add column if not exists internal_reservations_enabled boolean default false,
  add column if not exists reservation_source text default 'external';

alter table if exists public.activities
  add column if not exists reservation_url text,
  add column if not exists reservation_link text,
  add column if not exists booking_url text,
  add column if not exists website text,
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text,
  add column if not exists uses_internal_reservations boolean default false,
  add column if not exists internal_reservations_enabled boolean default false,
  add column if not exists reservation_source text default 'external';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'locations_reservation_source_check'
  ) then
    alter table public.locations
      add constraint locations_reservation_source_check
      check (reservation_source in ('internal', 'external', 'both', 'none'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_reservation_source_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_reservation_source_check
      check (reservation_source in ('internal', 'external', 'both', 'none'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'activities_reservation_source_check'
  ) then
    alter table public.activities
      add constraint activities_reservation_source_check
      check (reservation_source in ('internal', 'external', 'both', 'none'));
  end if;
end $$;

create index if not exists locations_reservation_source_idx on public.locations (reservation_source);
create index if not exists restaurants_google_place_id_reservation_idx on public.restaurants (google_place_id) where google_place_id is not null;
create index if not exists activities_google_place_id_reservation_idx on public.activities (google_place_id) where google_place_id is not null;

update public.locations
set reservation_source = case
  when coalesce(uses_internal_reservations, false) or coalesce(internal_reservations_enabled, false) then 'internal'
  when coalesce(reservation_url, booking_url, reservation_link, external_reservation_url) is not null then 'external'
  else 'none'
end
where reservation_source is null;

-- Safe hybrid reservation link discovery metadata.
alter table if exists public.locations
  add column if not exists reservation_provider text,
  add column if not exists reservation_discovery_status text default 'pending',
  add column if not exists reservation_discovery_error text,
  add column if not exists reservation_discovered_at timestamptz,
  add column if not exists reservation_last_checked_at timestamptz,
  add column if not exists reservation_manual_override boolean default false,
  add column if not exists suggested_reservation_url text;

alter table if exists public.restaurants
  add column if not exists reservation_provider text,
  add column if not exists reservation_discovery_status text default 'pending',
  add column if not exists reservation_discovery_error text,
  add column if not exists reservation_discovered_at timestamptz,
  add column if not exists reservation_last_checked_at timestamptz,
  add column if not exists reservation_manual_override boolean default false,
  add column if not exists suggested_reservation_url text;

alter table if exists public.activities
  add column if not exists reservation_provider text,
  add column if not exists reservation_discovery_status text default 'pending',
  add column if not exists reservation_discovery_error text,
  add column if not exists reservation_discovered_at timestamptz,
  add column if not exists reservation_last_checked_at timestamptz,
  add column if not exists reservation_manual_override boolean default false,
  add column if not exists suggested_reservation_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'locations_reservation_discovery_status_check'
  ) then
    alter table public.locations
      add constraint locations_reservation_discovery_status_check
      check (reservation_discovery_status in ('pending', 'found', 'not_found', 'blocked', 'failed', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_reservation_discovery_status_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_reservation_discovery_status_check
      check (reservation_discovery_status in ('pending', 'found', 'not_found', 'blocked', 'failed', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'activities_reservation_discovery_status_check'
  ) then
    alter table public.activities
      add constraint activities_reservation_discovery_status_check
      check (reservation_discovery_status in ('pending', 'found', 'not_found', 'blocked', 'failed', 'manual'));
  end if;
end $$;

create index if not exists locations_reservation_discovery_status_idx on public.locations (reservation_discovery_status);
create index if not exists restaurants_reservation_discovery_status_idx on public.restaurants (reservation_discovery_status);
create index if not exists activities_reservation_discovery_status_idx on public.activities (reservation_discovery_status);
create index if not exists locations_reservation_last_checked_idx on public.locations (reservation_last_checked_at);
create index if not exists restaurants_reservation_last_checked_idx on public.restaurants (reservation_last_checked_at);
create index if not exists activities_reservation_last_checked_idx on public.activities (reservation_last_checked_at);

update public.locations
set reservation_discovery_status = case
  when coalesce(reservation_manual_override, false) then 'manual'
  when coalesce(reservation_url, booking_url, reservation_link, external_reservation_url) is not null then 'found'
  else coalesce(reservation_discovery_status, 'pending')
end
where reservation_discovery_status is null or reservation_discovery_status = 'pending';

update public.restaurants
set reservation_discovery_status = case
  when coalesce(reservation_manual_override, false) then 'manual'
  when coalesce(reservation_url, booking_url, reservation_link, external_reservation_url) is not null then 'found'
  else coalesce(reservation_discovery_status, 'pending')
end
where reservation_discovery_status is null or reservation_discovery_status = 'pending';

update public.activities
set reservation_discovery_status = case
  when coalesce(reservation_manual_override, false) then 'manual'
  when coalesce(reservation_url, booking_url, reservation_link, external_reservation_url) is not null then 'found'
  else coalesce(reservation_discovery_status, 'pending')
end
where reservation_discovery_status is null or reservation_discovery_status = 'pending';
