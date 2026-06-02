create or replace function public.oh_is_wellness_activity(
  p_location_type text,
  p_text text
)
returns boolean
language sql
immutable
as $$
  select
    public.oh_safe_lower_text(coalesce(p_text,'')) ~ '(\mspa\M|massage|wellness|head spa|float spa|yoga spa|recovery spa)'
    and (
      public.oh_safe_lower_text(coalesce(p_location_type,'')) = 'activity'
      or public.oh_safe_lower_text(coalesce(p_text,'')) ~ '(activity|spa|massage|wellness|head spa|float spa|yoga spa|recovery spa)'
    );
$$;

create or replace function public.oh_is_qualified_wellness_activity(
  p_location_type text,
  p_text text,
  p_rating numeric,
  p_review_count integer,
  p_has_photos boolean,
  p_photo_status text,
  p_public_visibility_tier text
)
returns boolean
language sql
immutable
as $$
  select public.oh_is_wellness_activity(p_location_type, p_text)
    and p_has_photos is true
    and public.oh_safe_lower_text(p_photo_status) <> 'missing_photo'
    and coalesce(p_rating, 0) >= 4.0
    and coalesce(p_review_count, 0) >= 25
    and public.oh_safe_lower_text(p_public_visibility_tier) <> 'hidden';
$$;

create or replace function public.oh_low_level_reason(
  p_location_type text,
  p_text text,
  p_rating numeric,
  p_review_count integer,
  p_has_photos boolean,
  p_photo_status text,
  p_curation_tier text,
  p_public_visibility_tier text,
  p_source_text text
)
returns text
language plpgsql
immutable
as $$
declare
  t text := public.oh_safe_lower_text(p_text);
  lt text := public.oh_safe_lower_text(p_location_type);
  tier text := public.oh_safe_lower_text(p_curation_tier);
  vis text := public.oh_safe_lower_text(p_public_visibility_tier);
  photo text := public.oh_safe_lower_text(p_photo_status);
  source_text text := public.oh_safe_lower_text(p_source_text || ' ' || p_text);
  protected boolean := tier in ('premium','curated','date_worthy','featured','high_value') or vis in ('premium','curated');
  only_generic_restaurant boolean := lt = 'restaurant' and t ~ '(^|\s)restaurant(s)?(\s|$)' and t !~ '(cuisine|bar|grill|steak|seafood|sushi|ramen|thai|korean|japanese|italian|mexican|brunch|lounge|rooftop|date|curated|premium|featured|photo|reservation)';
begin
  if public.oh_is_qualified_wellness_activity(lt, t, p_rating, p_review_count, p_has_photos, photo, vis) then return null; end if;
  if t ~ '(smoke shop|liquor store|pharmacy|gas station|laundromat|check cashing)' then return 'smoke_liquor_pharmacy_gas'; end if;
  if t ~ '(grocery|convenience store|corner store|supermarket|mini market)' then return 'grocery_convenience'; end if;
  if t ~ '(deli|delicatessen|bodega|\mmarket\M)' then return 'deli_bodega_market'; end if;
  if t ~ '(food cart|food truck|halal cart)' then return 'food_cart_or_truck'; end if;
  if t ~ '(fast food|quick service|counter service|buffet|pizza by the slice)' then return 'fast_food'; end if;
  if t ~ '(takeout|take out|take-away|takeaway|carryout|delivery only|chinese takeout|\mexpress\M)' then return 'takeout_or_counter_service'; end if;
  if public.oh_is_nyc_import_source(source_text) and lt = 'restaurant' and (p_has_photos is not true or p_rating is null or p_review_count is null or p_review_count < 25) then return 'nyc_import_unverified'; end if;
  if only_generic_restaurant and (p_has_photos is not true or p_rating is null or p_review_count is null or p_review_count < 25) then return 'generic_restaurant_unverified'; end if;
  if protected then return null; end if;
  if p_has_photos is not true or photo = 'missing_photo' then return 'missing_photo'; end if;
  if lt = 'restaurant' and (p_rating is null or p_rating < 4.0 or p_review_count is null or p_review_count < 25) then return 'weak_quality'; end if;
  if t ~ '(parking|atm|bank|storage|warehouse|repair|auto shop)' then return 'low_experience_category'; end if;
  return null;
end;
$$;

create or replace function public.oh_is_low_level_location(
  p_location_type text,
  p_text text,
  p_rating numeric,
  p_review_count integer,
  p_has_photos boolean,
  p_photo_status text,
  p_curation_tier text,
  p_public_visibility_tier text,
  p_source_text text
)
returns boolean
language plpgsql
immutable
as $$
declare
  t text := public.oh_safe_lower_text(p_text);
  lt text := public.oh_safe_lower_text(p_location_type);
  tier text := public.oh_safe_lower_text(p_curation_tier);
  vis text := public.oh_safe_lower_text(p_public_visibility_tier);
  photo text := public.oh_safe_lower_text(p_photo_status);
  source_text text := public.oh_safe_lower_text(p_source_text || ' ' || p_text);
begin
  if public.oh_is_qualified_wellness_activity(lt, t, p_rating, p_review_count, p_has_photos, photo, vis) then return false; end if;
  return public.oh_low_level_reason(lt, t, p_rating, p_review_count, p_has_photos, photo, tier, vis, source_text) is not null;
end;
$$;

with wellness as (
  select l.id
  from public.locations l
  cross join lateral (
    select public.oh_location_low_level_text(l.name,l.restaurant_name,l.activity_name,l.location_type,l.primary_category,l.category,l.cuisine,l.cuisine_type,l.food_type,l.activity_type,l.description,l.search_document,l.tags,l.google_types,l.source_table,l.import_source,l.source) as low_text
  ) t
  where public.oh_is_qualified_wellness_activity(l.location_type, t.low_text, l.rating, l.review_count, l.has_photos, l.photo_status, l.public_visibility_tier)
    and coalesce(l.is_hidden,false) = false
    and coalesce(l.duplicate_status,'') <> 'duplicate'
    and coalesce(l.status,'') not in ('closed','deleted','archived','hidden')
)
update public.locations l
set is_low_level = false,
    low_level_reason = case when coalesce(l.low_level_source,'') in ('auto_cleanup','nyc_import_cleanup','staging_quality') then null else l.low_level_reason end,
    low_level_detected_at = case when coalesce(l.low_level_source,'') in ('auto_cleanup','nyc_import_cleanup','staging_quality') then null else l.low_level_detected_at end,
    low_level_source = case when coalesce(l.low_level_source,'') in ('auto_cleanup','nyc_import_cleanup','staging_quality') then null else l.low_level_source end,
    public_visibility_tier = case when coalesce(l.public_visibility_tier,'standard') in ('low_level','hidden') then 'standard' else coalesce(l.public_visibility_tier,'standard') end,
    curation_tier = case when coalesce(l.curation_tier,'standard') = 'low_level' then 'standard' else coalesce(l.curation_tier,'standard') end,
    source_quality_status = case when coalesce(l.source_quality_status,'unknown') in ('imported_unverified','generic_restaurant','needs_enrichment','low_level_review') then 'enriched' else coalesce(l.source_quality_status,'unknown') end,
    import_confidence = case when coalesce(l.import_confidence,'unknown') = 'low' then 'unknown' else coalesce(l.import_confidence,'unknown') end,
    data_status = case when coalesce(l.data_status,'clean') = 'needs_review' then 'clean' else coalesce(l.data_status,'clean') end,
    quality_status = case when coalesce(l.quality_status,'') = 'low_level_review' then 'publish_ready' else l.quality_status end,
    is_searchable = true,
    search_boost = greatest(coalesce(l.search_boost, 0), 0),
    date_score = greatest(coalesce(l.date_score, 50), 50)
from wellness w
where l.id = w.id;
