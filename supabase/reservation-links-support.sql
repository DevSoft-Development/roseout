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
