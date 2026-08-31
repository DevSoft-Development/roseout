-- Production readiness: Westchester market repair plus duplicate-prevention foundations.
-- Safe to run repeatedly in Supabase SQL editor.

alter table if exists public.locations
  add column if not exists normalized_name text,
  add column if not exists normalized_address text,
  add column if not exists duplicate_check_key text;

update public.locations
set
  normalized_name = lower(regexp_replace(coalesce(name, restaurant_name, activity_name, ''), '[^a-z0-9]+', ' ', 'g')),
  normalized_address = lower(regexp_replace(coalesce(address, ''), '[^a-z0-9]+', ' ', 'g')),
  duplicate_check_key = lower(regexp_replace(coalesce(name, restaurant_name, activity_name, ''), '[^a-z0-9]+', ' ', 'g')) || '|' || lower(regexp_replace(coalesce(address, ''), '[^a-z0-9]+', ' ', 'g')) || '|' || lower(coalesce(city, '')) || '|' || upper(coalesce(state, ''))
where normalized_name is null
   or normalized_address is null
   or duplicate_check_key is null;

create index if not exists idx_locations_google_place_id_not_null
  on public.locations (google_place_id)
  where google_place_id is not null;

create index if not exists idx_locations_duplicate_check_key
  on public.locations (duplicate_check_key)
  where duplicate_check_key is not null and duplicate_check_key <> '|||';

create index if not exists idx_locations_phone_not_null
  on public.locations (phone)
  where phone is not null;

create index if not exists idx_locations_website_not_null
  on public.locations (website)
  where website is not null;

create index if not exists idx_locations_market_type_searchable
  on public.locations (market, location_type, is_searchable);

create index if not exists idx_locations_lat_lng
  on public.locations (latitude, longitude)
  where latitude is not null and longitude is not null;

update public.locations
set market = 'WESTCHESTER'
where coalesce(market, '') in ('', 'UNKNOWN')
  and upper(coalesce(state, '')) = 'NY'
  and (
    lower(coalesce(county, '')) = 'westchester'
    or lower(coalesce(city, '')) in ('white plains','yonkers','new rochelle','mount vernon','scarsdale','port chester','rye','tarrytown','peekskill','dobbs ferry','bronxville','mamaroneck','ossining','sleepy hollow','hastings-on-hudson','hastings on hudson')
    or coalesce(zip_code, '') similar to '(105|106|107|108)%'
  );
