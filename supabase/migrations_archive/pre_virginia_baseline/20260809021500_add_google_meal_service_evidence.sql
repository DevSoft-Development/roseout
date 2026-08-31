alter table public.locations
  add column if not exists google_meal_periods text[] not null default '{}'::text[],
  add column if not exists google_meal_service_checked_at timestamptz,
  add column if not exists google_meal_service_error text;

comment on column public.locations.google_meal_periods is
  'Meal periods directly confirmed by Google Places service attributes, e.g. breakfast, brunch, lunch, dinner.';
comment on column public.locations.google_meal_service_checked_at is
  'Last time Google Places meal-service attributes were checked for this canonical location.';
comment on column public.locations.google_meal_service_error is
  'Last bounded Google meal-service evidence lookup error, if any.';
