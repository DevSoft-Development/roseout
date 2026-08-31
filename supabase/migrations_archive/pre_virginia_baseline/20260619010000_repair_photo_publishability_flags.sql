update locations
set
  has_photos = true,
  photo_status = case
    when coalesce(photo_status, '') not in ('', 'missing_photo') then photo_status
    when coalesce(main_image, image_url, '') ilike '%storage/v1/object/public%' then 'storage_cached'
    when coalesce(main_image, image_url, '') ilike '%google%' then 'google_photo'
    else 'has_photo'
  end,
  quality_status = case
    when quality_status = 'needs_photo'
      and address is not null
      and latitude is not null
      and longitude is not null
      and coalesce(primary_category, cuisine, cuisine_type, activity_type, primary_tag) is not null
      and coalesce(duplicate_status, '') <> 'duplicate'
      and coalesce(status, '') not in ('closed', 'archived')
      and coalesce(is_hidden, false) = false
      and coalesce(is_low_level, false) = false
      and coalesce(public_visibility_tier, '') not in ('hidden', 'low_level')
      and coalesce(curation_tier, '') <> 'low_level'
      and coalesce(source_quality_status, '') not in ('imported_unverified', 'generic_restaurant', 'needs_enrichment', 'low_level_review')
      and coalesce(import_confidence, '') <> 'low'
    then 'publish_ready'
    when quality_status = 'needs_photo'
    then 'review'
    else quality_status
  end,
  data_status = case
    when quality_status = 'needs_photo'
      and address is not null
      and latitude is not null
      and longitude is not null
      and coalesce(primary_category, cuisine, cuisine_type, activity_type, primary_tag) is not null
      and coalesce(duplicate_status, '') <> 'duplicate'
      and coalesce(status, '') not in ('closed', 'archived')
      and coalesce(is_hidden, false) = false
      and coalesce(is_low_level, false) = false
      and coalesce(public_visibility_tier, '') not in ('hidden', 'low_level')
      and coalesce(curation_tier, '') <> 'low_level'
      and coalesce(source_quality_status, '') not in ('imported_unverified', 'generic_restaurant', 'needs_enrichment', 'low_level_review')
      and coalesce(import_confidence, '') <> 'low'
    then 'clean'
    else coalesce(data_status, 'needs_review')
  end,
  is_searchable = case
    when address is not null
      and latitude is not null
      and longitude is not null
      and coalesce(primary_category, cuisine, cuisine_type, activity_type, primary_tag) is not null
      and coalesce(duplicate_status, '') <> 'duplicate'
      and coalesce(status, '') not in ('closed', 'archived')
      and coalesce(is_hidden, false) = false
      and coalesce(is_low_level, false) = false
      and coalesce(public_visibility_tier, '') not in ('hidden', 'low_level')
      and coalesce(curation_tier, '') <> 'low_level'
      and coalesce(source_quality_status, '') not in ('imported_unverified', 'generic_restaurant', 'needs_enrichment', 'low_level_review')
      and coalesce(import_confidence, '') <> 'low'
    then true
    else false
  end,
  updated_at = now()
where
  (
    nullif(trim(coalesce(main_image, '')), '') is not null
    or nullif(trim(coalesce(image_url, '')), '') is not null
    or jsonb_array_length(coalesce(images::jsonb, '[]'::jsonb)) > 0
  )
  and (
    coalesce(has_photos, false) = false
    or coalesce(photo_status, '') in ('', 'missing_photo')
    or quality_status = 'needs_photo'
  );

select
  count(*) filter (
    where nullif(trim(coalesce(main_image, image_url, '')), '') is not null
      and coalesce(has_photos, false) = false
  ) as has_image_but_has_photos_false,
  count(*) filter (
    where nullif(trim(coalesce(main_image, image_url, '')), '') is not null
      and coalesce(photo_status, '') = 'missing_photo'
  ) as has_image_but_missing_photo_status,
  count(*) filter (
    where nullif(trim(coalesce(main_image, image_url, '')), '') is not null
      and quality_status = 'needs_photo'
  ) as has_image_but_needs_photo
from locations;
