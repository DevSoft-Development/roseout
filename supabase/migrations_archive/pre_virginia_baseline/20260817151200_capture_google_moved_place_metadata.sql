alter table public.locations
  add column if not exists google_moved_place text,
  add column if not exists google_moved_place_id text;

comment on column public.locations.google_moved_place is
  'Google Places movedPlace resource name, e.g. places/{placeId}, when a permanently closed business moved.';

comment on column public.locations.google_moved_place_id is
  'Google Places movedPlaceId successor Place ID when a permanently closed business moved.';

create index if not exists locations_google_moved_place_id_idx
  on public.locations (google_moved_place_id)
  where google_moved_place_id is not null;
