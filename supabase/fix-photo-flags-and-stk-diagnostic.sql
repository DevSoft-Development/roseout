-- Fix locations marked as having photos when no usable image URL exists.
update public.locations
set
  has_photos = false,
  photo_status = 'missing_photo',
  updated_at = now()
where
  coalesce(has_photos, false) = true
  and nullif(trim(coalesce(main_image, '')), '') is null
  and nullif(trim(coalesce(image_url, '')), '') is null
  and (
    images is null
    or images = '[]'::jsonb
    or images = '{}'::jsonb
  );

-- Clear bad placeholder values from main_image and image_url.
update public.locations
set
  main_image = case
    when lower(coalesce(main_image, '')) similar to '%(placeholder|default-image|photo coming soon|no-image|missing)%'
    then null
    else main_image
  end,
  image_url = case
    when lower(coalesce(image_url, '')) similar to '%(placeholder|default-image|photo coming soon|no-image|missing)%'
    then null
    else image_url
  end,
  updated_at = now()
where
  lower(coalesce(main_image, '')) similar to '%(placeholder|default-image|photo coming soon|no-image|missing)%'
  or lower(coalesce(image_url, '')) similar to '%(placeholder|default-image|photo coming soon|no-image|missing)%';

-- Recalculate photo flags after clearing bad values.
update public.locations
set
  has_photos = false,
  photo_status = 'missing_photo',
  updated_at = now()
where
  nullif(trim(coalesce(main_image, '')), '') is null
  and nullif(trim(coalesce(image_url, '')), '') is null
  and (
    images is null
    or images = '[]'::jsonb
    or images = '{}'::jsonb
  );

-- Diagnostic for STK and similar records.
select
  id,
  name,
  restaurant_name,
  address,
  city,
  state,
  google_place_id,
  place_id,
  has_photos,
  photo_status,
  main_image,
  image_url,
  images,
  is_searchable,
  quality_status,
  data_status
from public.locations
where
  lower(coalesce(name, restaurant_name, '')) like '%stk%'
  or lower(coalesce(restaurant_name, name, '')) like '%stk%'
order by
  rating desc nulls last,
  review_count desc nulls last;
