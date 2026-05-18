alter table public.locations
  add column if not exists quality_score numeric default 0,
  add column if not exists popularity_score numeric default 0,
  add column if not exists search_score numeric default 0,
  add column if not exists review_score numeric default 0,
  add column if not exists last_ranked_at timestamptz;

create index if not exists locations_city_state_idx on public.locations (city, state);
create index if not exists locations_location_type_idx on public.locations (location_type);
create index if not exists locations_rating_idx on public.locations (rating);
create index if not exists locations_review_count_idx on public.locations (review_count);
create index if not exists locations_quality_score_idx on public.locations (quality_score);
create index if not exists locations_lat_lng_idx on public.locations (latitude, longitude);
