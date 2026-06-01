create or replace function public.oh_is_valid_photo_text(p_value text)
returns boolean
language sql
immutable
as $$
  select
    p_value is not null
    and length(trim(p_value)) >= 8
    and lower(trim(p_value)) not in (
      'null',
      'undefined',
      'none',
      'n/a',
      'na',
      'placeholder',
      'placeholder.jpg',
      '/placeholder.jpg',
      '#',
      '?'
    )
    and lower(trim(p_value)) not like '%placeholder%'
    and lower(trim(p_value)) not like '%missing%'
    and lower(trim(p_value)) not like '%no-image%'
    and lower(trim(p_value)) not like '%no_image%'
    and lower(trim(p_value)) not like '%default-image%'
    and lower(trim(p_value)) not like '%default_image%'
    and (
      lower(trim(p_value)) like 'http://%'
      or lower(trim(p_value)) like 'https://%'
      or left(trim(p_value), 1) = '/'
      or lower(trim(p_value)) like '%supabase%'
      or lower(trim(p_value)) like '%storage%'
      or lower(trim(p_value)) like '%googleusercontent%'
      or lower(trim(p_value)) like '%ggpht%'
      or lower(trim(p_value)) like '%googleapis%'
      or lower(trim(p_value)) like '%yelpcdn%'
      or lower(trim(p_value)) like '%cloudinary%'
    );
$$;

create or replace function public.oh_jsonb_has_valid_photo(p_value jsonb)
returns boolean
language sql
stable
as $$
  select case
    when p_value is null then false

    when jsonb_typeof(p_value) = 'string'
      then public.oh_is_valid_photo_text(p_value #>> '{}')

    when jsonb_typeof(p_value) = 'array'
      then exists (
        select 1
        from jsonb_array_elements(p_value) item
        where
          (
            jsonb_typeof(item) = 'string'
            and public.oh_is_valid_photo_text(item #>> '{}')
          )
          or
          (
            jsonb_typeof(item) = 'object'
            and (
              public.oh_is_valid_photo_text(item->>'url')
              or public.oh_is_valid_photo_text(item->>'src')
              or public.oh_is_valid_photo_text(item->>'image_url')
              or public.oh_is_valid_photo_text(item->>'main_image')
            )
          )
      )

    when jsonb_typeof(p_value) = 'object'
      then (
        public.oh_is_valid_photo_text(p_value->>'url')
        or public.oh_is_valid_photo_text(p_value->>'src')
        or public.oh_is_valid_photo_text(p_value->>'image_url')
        or public.oh_is_valid_photo_text(p_value->>'main_image')
      )

    else false
  end;
$$;

update public.locations
set
  has_photos = (
    public.oh_is_valid_photo_text(main_image)
    or public.oh_is_valid_photo_text(image_url)
    or public.oh_jsonb_has_valid_photo(to_jsonb(images))
    or public.oh_jsonb_has_valid_photo(to_jsonb(gallery_images))
  ),
  photo_status = case
    when (
      public.oh_is_valid_photo_text(main_image)
      or public.oh_is_valid_photo_text(image_url)
      or public.oh_jsonb_has_valid_photo(to_jsonb(images))
      or public.oh_jsonb_has_valid_photo(to_jsonb(gallery_images))
    )
    then case
      when coalesce(photo_status, '') in ('owner_photo', 'admin_photo', 'google_photo', 'imported_photo')
        then photo_status
      else 'has_photo'
    end
    else 'missing_photo'
  end,
  is_searchable = case
    when (
      public.oh_is_valid_photo_text(main_image)
      or public.oh_is_valid_photo_text(image_url)
      or public.oh_jsonb_has_valid_photo(to_jsonb(images))
      or public.oh_jsonb_has_valid_photo(to_jsonb(gallery_images))
    )
    then coalesce(is_searchable, true)
    else false
  end,
  data_status = case
    when not (
      public.oh_is_valid_photo_text(main_image)
      or public.oh_is_valid_photo_text(image_url)
      or public.oh_jsonb_has_valid_photo(to_jsonb(images))
      or public.oh_jsonb_has_valid_photo(to_jsonb(gallery_images))
    )
    and coalesce(data_status, 'clean') = 'clean'
    then 'needs_review'
    else data_status
  end
where deleted_at is null;

create index if not exists locations_public_photo_gate_idx
on public.locations (has_photos, photo_status, is_searchable, is_hidden, active, status, data_status);
