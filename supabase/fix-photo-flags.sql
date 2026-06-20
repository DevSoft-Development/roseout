update public.locations
set
  has_photos = false,
  photo_status = 'missing_photo'
where coalesce(has_photos, false) = true
  and nullif(trim(coalesce(image_url, '')), '') is null
  and nullif(trim(coalesce(main_image, '')), '') is null
  and (
    images is null
    or cardinality(images) = 0
  )
  and (
    gallery_images is null
    or gallery_images = '[]'::jsonb
    or gallery_images = 'null'::jsonb
    or (
      jsonb_typeof(gallery_images) = 'array'
      and jsonb_array_length(gallery_images) = 0
    )
  );

select
  count(*) as has_photos_true_but_no_usable_image
from public.locations
where coalesce(has_photos, false) = true
  and nullif(trim(coalesce(image_url, '')), '') is null
  and nullif(trim(coalesce(main_image, '')), '') is null
  and (
    images is null
    or cardinality(images) = 0
  )
  and (
    gallery_images is null
    or gallery_images = '[]'::jsonb
    or gallery_images = 'null'::jsonb
    or (
      jsonb_typeof(gallery_images) = 'array'
      and jsonb_array_length(gallery_images) = 0
    )
  );
