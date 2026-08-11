drop trigger if exists locations_enqueue_search_profile on public.locations;

create trigger locations_enqueue_search_profile
after insert or update of
  location_type,
  restaurant_name,
  activity_name,
  primary_category,
  primary_tag,
  activity_type,
  cuisine,
  cuisine_type,
  tags,
  vibe_tags,
  best_for_tags,
  date_style_tags,
  search_keywords,
  google_types,
  semantic_tags,
  intent_tags,
  description,
  public_visibility_tier,
  curation_tier,
  source_quality_status,
  quality_status,
  data_status,
  status,
  is_searchable,
  is_hidden,
  is_low_level,
  active,
  deleted_at,
  market,
  city,
  neighborhood,
  borough,
  county,
  state,
  latitude,
  longitude
on public.locations
for each row
execute function public.enqueue_location_search_profile_refresh();