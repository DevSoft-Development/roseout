select
  id,
  name,
  restaurant_name,
  address,
  google_place_id,
  place_id,
  has_photos,
  photo_status,
  main_image,
  image_url,
  images
from public.locations
where
  lower(coalesce(name, restaurant_name, '')) like '%stk%'
  or lower(coalesce(restaurant_name, name, '')) like '%stk%';
