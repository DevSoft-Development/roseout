-- Fix existing theaters/cinemas that were previously classified as restaurants.
-- Safe to run more than once.

update public.locations
set
  location_type = 'activity',
  activity_type = coalesce(nullif(activity_type, ''), 'theater'),
  activity_name = coalesce(nullif(activity_name, ''), nullif(name, ''), nullif(restaurant_name, '')),
  restaurant_name = null,
  cuisine = null,
  cuisine_type = null,
  food_type = null,
  updated_at = now()
where deleted_at is null
  and (
    lower(coalesce(location_type, '')) like '%theater%'
    or lower(coalesce(location_type, '')) like '%theatre%'
    or lower(coalesce(location_type, '')) like '%cinema%'
    or lower(coalesce(primary_category, '')) like '%theater%'
    or lower(coalesce(primary_category, '')) like '%theatre%'
    or lower(coalesce(primary_category, '')) like '%cinema%'
    or lower(coalesce(primary_category, '')) like '%performing arts%'
    or lower(coalesce(activity_type, '')) like '%theater%'
    or lower(coalesce(activity_type, '')) like '%theatre%'
    or lower(coalesce(activity_type, '')) like '%cinema%'
    or lower(coalesce(name, '')) like '%theater%'
    or lower(coalesce(name, '')) like '%theatre%'
    or lower(coalesce(name, '')) like '%cinema%'
    or lower(array_to_string(coalesce(google_types, '{}'::text[]), ' ')) like '%movie_theater%'
    or lower(array_to_string(coalesce(google_types, '{}'::text[]), ' ')) like '%performing_arts%'
  )
  and (
    location_type = 'restaurant'
    or restaurant_name is not null
    or cuisine is not null
    or cuisine_type is not null
    or food_type is not null
  );

-- Verify remaining bad classifications. This should return 0.
select count(*) as theaters_still_classified_as_restaurants
from public.locations
where deleted_at is null
  and location_type = 'restaurant'
  and (
    lower(coalesce(primary_category, '')) like '%theater%'
    or lower(coalesce(primary_category, '')) like '%theatre%'
    or lower(coalesce(primary_category, '')) like '%cinema%'
    or lower(coalesce(name, '')) like '%theater%'
    or lower(coalesce(name, '')) like '%theatre%'
    or lower(coalesce(name, '')) like '%cinema%'
    or lower(array_to_string(coalesce(google_types, '{}'::text[]), ' ')) like '%movie_theater%'
  );
