-- Keep restaurant records canonical when duplicate candidates disagree on domain.
-- Rooftop/nightlife/activity data is still merged into tags and secondary fields.

create or replace function public.oh_preserve_restaurant_duplicate_master()
returns trigger
language plpgsql
security definer
as $$
declare
  v_a_type text;
  v_b_type text;
begin
  select location_type into v_a_type from public.locations where id = new.location_a_id;
  select location_type into v_b_type from public.locations where id = new.location_b_id;

  if coalesce(v_a_type, '') = 'restaurant'
    and coalesce(v_b_type, '') in ('activity', 'nightlife') then
    new.suggested_master_id := new.location_a_id;
  elsif coalesce(v_b_type, '') = 'restaurant'
    and coalesce(v_a_type, '') in ('activity', 'nightlife') then
    new.suggested_master_id := new.location_b_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preserve_restaurant_duplicate_master
  on public.location_duplicate_review;
create trigger trg_preserve_restaurant_duplicate_master
before insert or update of suggested_master_id, location_a_id, location_b_id
on public.location_duplicate_review
for each row execute function public.oh_preserve_restaurant_duplicate_master();

create or replace function public.oh_merge_live_location_duplicate(
  p_master_id uuid,
  p_duplicate_id uuid,
  p_reason text default 'admin_merge'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  merged text[] := '{}';
  a uuid;
  b uuid;
  v_master_id uuid := p_master_id;
  v_duplicate_id uuid := p_duplicate_id;
  v_master_type text;
  v_duplicate_type text;
  v_swapped_for_domain_safety boolean := false;
begin
  if p_master_id = p_duplicate_id then
    raise exception 'master and duplicate must differ';
  end if;

  if not exists(select 1 from public.locations where id = p_master_id)
    or not exists(select 1 from public.locations where id = p_duplicate_id) then
    raise exception 'location not found';
  end if;

  select location_type into v_master_type
  from public.locations where id = v_master_id;
  select location_type into v_duplicate_type
  from public.locations where id = v_duplicate_id;

  -- A richer activity/nightlife import must not replace a restaurant domain.
  if coalesce(v_master_type, '') in ('activity', 'nightlife')
    and coalesce(v_duplicate_type, '') = 'restaurant' then
    v_master_id := p_duplicate_id;
    v_duplicate_id := p_master_id;
    v_swapped_for_domain_safety := true;
  end if;

  update public.locations m set
    tags = (
      select array(
        select distinct x
        from unnest(
          coalesce(m.tags, '{}') || coalesce(d.tags, '{}') ||
          array_remove(array[
            d.primary_category,
            d.cuisine,
            d.cuisine_type,
            d.activity_type,
            d.primary_tag,
            d.location_type
          ], null)
        ) x
        where nullif(trim(x), '') is not null
      )
    ),
    vibe_tags = (
      select array(select distinct x from unnest(coalesce(m.vibe_tags, '{}') || coalesce(d.vibe_tags, '{}')) x where nullif(trim(x), '') is not null)
    ),
    best_for_tags = (
      select array(select distinct x from unnest(coalesce(m.best_for_tags, '{}') || coalesce(d.best_for_tags, '{}')) x where nullif(trim(x), '') is not null)
    ),
    search_keywords = (
      select array(
        select distinct x
        from unnest(
          coalesce(m.search_keywords, '{}') || coalesce(d.search_keywords, '{}') ||
          array_remove(array[
            d.primary_category,
            d.cuisine,
            d.cuisine_type,
            d.activity_type,
            d.primary_tag,
            d.location_type
          ], null)
        ) x
        where nullif(trim(x), '') is not null
      )
    ),
    google_types = (
      select array(select distinct x from unnest(coalesce(m.google_types, '{}') || coalesce(d.google_types, '{}')) x where nullif(trim(x), '') is not null)
    ),
    images = (
      select array(select distinct x from unnest(coalesce(m.images, '{}') || coalesce(d.images, '{}')) x where nullif(trim(x), '') is not null)
    ),
    primary_category = coalesce(nullif(m.primary_category, ''), nullif(d.primary_category, '')),
    cuisine = coalesce(nullif(m.cuisine, ''), nullif(d.cuisine, '')),
    cuisine_type = coalesce(nullif(m.cuisine_type, ''), nullif(d.cuisine_type, '')),
    activity_type = coalesce(nullif(m.activity_type, ''), nullif(d.activity_type, '')),
    primary_tag = coalesce(nullif(m.primary_tag, ''), nullif(d.primary_tag, '')),
    main_image = coalesce(nullif(m.main_image, ''), nullif(d.main_image, '')),
    image_url = coalesce(nullif(m.image_url, ''), nullif(d.image_url, '')),
    phone = coalesce(nullif(m.phone, ''), nullif(d.phone, '')),
    website = coalesce(nullif(m.website, ''), nullif(d.website, '')),
    instagram_url = coalesce(nullif(m.instagram_url, ''), nullif(d.instagram_url, '')),
    reservation_url = coalesce(nullif(m.reservation_url, ''), nullif(d.reservation_url, '')),
    reservation_link = coalesce(nullif(m.reservation_link, ''), nullif(d.reservation_link, '')),
    external_reservation_url = coalesce(nullif(m.external_reservation_url, ''), nullif(d.external_reservation_url, '')),
    quality_score = greatest(coalesce(m.quality_score, 0), coalesce(d.quality_score, 0)),
    review_count = greatest(coalesce(m.review_count, 0), coalesce(d.review_count, 0)),
    rating = greatest(coalesce(m.rating, 0), coalesce(d.rating, 0)),
    updated_at = now()
  from public.locations d
  where m.id = v_master_id and d.id = v_duplicate_id;

  merged := array[
    'tags',
    'vibe_tags',
    'best_for_tags',
    'search_keywords',
    'google_types',
    'images',
    'category_fields',
    'photo_fields',
    'business_metadata',
    'scores'
  ];

  update public.locations
  set duplicate_status = 'duplicate',
      duplicate_of = v_master_id,
      is_searchable = false,
      is_hidden = true,
      last_deduped_at = now(),
      updated_at = now()
  where id = v_duplicate_id;

  a := least(v_master_id, v_duplicate_id);
  b := greatest(v_master_id, v_duplicate_id);

  update public.location_duplicate_review
  set status = 'merged',
      suggested_master_id = v_master_id,
      decision_reason = p_reason,
      decided_at = now(),
      updated_at = now()
  where location_a_id = a and location_b_id = b;

  return jsonb_build_object(
    'success', true,
    'master_id', v_master_id,
    'duplicate_id', v_duplicate_id,
    'merged_fields', merged,
    'hidden_duplicate', true,
    'preserved_location_type', (
      select location_type from public.locations where id = v_master_id
    ),
    'swapped_for_domain_safety', v_swapped_for_domain_safety
  );
end;
$$;

-- Correct recommendations already waiting in the review queue.
update public.location_duplicate_review r
set suggested_master_id = case
      when coalesce(a.location_type, '') = 'restaurant'
        and coalesce(b.location_type, '') in ('activity', 'nightlife') then a.id
      when coalesce(b.location_type, '') = 'restaurant'
        and coalesce(a.location_type, '') in ('activity', 'nightlife') then b.id
      else r.suggested_master_id
    end,
    updated_at = now()
from public.locations a, public.locations b
where r.location_a_id = a.id
  and r.location_b_id = b.id
  and r.status = 'pending'
  and coalesce(a.location_type, '') <> coalesce(b.location_type, '');
