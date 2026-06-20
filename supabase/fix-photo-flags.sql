-- Safe/idempotent cleanup for locations incorrectly marked as having photos.
-- This repository uses text[] image collections in existing Supabase SQL examples
-- (for example, coalesce(l.images, array[]::text[]) as gallery_images).

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
    or cardinality(gallery_images) = 0
  );

-- Verification: should be 0 after cleanup for text[] image/gallery columns.
select count(*) as has_photos_true_without_usable_image
from public.locations
where coalesce(has_photos, false) = true
  and nullif(trim(coalesce(image_url, '')), '') is null
  and nullif(trim(coalesce(main_image, '')), '') is null
  and (images is null or cardinality(images) = 0)
  and (gallery_images is null or cardinality(gallery_images) = 0);
