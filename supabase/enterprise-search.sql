create extension if not exists pg_trgm;

create or replace function public.enterprise_search_locations(
  p_search_terms text[],
  p_domain text default 'any',
  p_neighborhood text default null,
  p_borough text default null,
  p_city text default null,
  p_county text default null,
  p_region text default null,
  p_state text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_radius_miles numeric default null,
  p_limit int default 40,
  p_allow_places_of_worship boolean default false,
  p_allow_low_level boolean default false
) returns table (
  id uuid, location_type text, restaurant_name text, activity_name text, name text, address text, city text, state text, zip_code text, neighborhood text, borough text, latitude numeric, longitude numeric, description text, cuisine text, cuisine_type text, activity_type text, primary_category text, tags text[], vibe_tags text[], best_for_tags text[], date_style_tags text[], search_keywords text[], google_types text[], semantic_tags text[], intent_tags text[], search_document text, semantic_search_text text, rating numeric, review_count integer, review_score numeric, quality_score numeric, popularity_score numeric, roseout_score numeric, theouthaven_score numeric, search_score numeric, recommendation_score numeric, analytics_score numeric, reservation_url text, reservation_link text, booking_url text, external_reservation_url text, website text, phone text, image_url text, main_image text, images jsonb, gallery_images jsonb, is_searchable boolean, is_hidden boolean, active boolean, status text, data_status text, deleted_at timestamptz, match_score numeric, term_score numeric, geo_score numeric, distance_score numeric, distance_miles numeric, domain_score numeric, quality_rank_score numeric
) language sql stable as $$
with candidates as (
  select l.*,
    lower(concat_ws(' ', l.name,l.restaurant_name,l.activity_name,l.location_type,l.primary_category,l.cuisine,l.cuisine_type,l.activity_type,l.description,l.neighborhood,l.borough,l.city,l.state,l.address,l.search_document,l.semantic_search_text,array_to_string(l.tags,' '),array_to_string(l.vibe_tags,' '),array_to_string(l.best_for_tags,' '),array_to_string(l.date_style_tags,' '),array_to_string(l.search_keywords,' '),array_to_string(l.google_types,' '),array_to_string(l.semantic_tags,' '),array_to_string(l.intent_tags,' '),array_to_string(l.special_features,' '),array_to_string(l.signature_items,' '),array_to_string(l.best_for,' '))) as haystack
  from public.locations l
  where l.deleted_at is null
    and coalesce(l.is_hidden,false) = false
    and coalesce(l.active,true) = true
    and coalesce(l.is_searchable,true) = true
    and coalesce(l.status,'') not in ('hidden','deleted','archived')
    and coalesce(l.data_status,'clean') not in ('hidden','deleted','archived')
    and (p_allow_low_level = true or coalesce(l.is_low_level, false) = false)
    and (p_allow_low_level = true or coalesce(l.public_visibility_tier, 'standard') not in ('low_level','hidden'))
    and (p_allow_low_level = true or coalesce(l.curation_tier, 'standard') <> 'low_level')
    and (p_allow_low_level = true or coalesce(l.source_quality_status, 'enriched') not in ('imported_unverified','generic_restaurant','needs_enrichment','low_level_review'))
    and (p_allow_low_level = true or coalesce(l.import_confidence, 'unknown') <> 'low')
    and (p_allow_low_level = true or coalesce(l.has_photos, false) = true)
    and (p_allow_low_level = true or coalesce(l.photo_status, '') <> 'missing_photo')
    and (
      p_allow_places_of_worship = true
      or not (
        lower(coalesce(l.primary_category, '')) like '%temple%'
        or lower(coalesce(l.primary_category, '')) like '%hindu temple%'
        or lower(coalesce(l.primary_category, '')) like '%church%'
        or lower(coalesce(l.primary_category, '')) like '%chapel%'
        or lower(coalesce(l.primary_category, '')) like '%cathedral%'
        or lower(coalesce(l.primary_category, '')) like '%mosque%'
        or lower(coalesce(l.primary_category, '')) like '%masjid%'
        or lower(coalesce(l.primary_category, '')) like '%synagogue%'
        or lower(coalesce(l.primary_category, '')) like '%shul%'
        or lower(coalesce(l.primary_category, '')) like '%place of worship%'
        or lower(coalesce(l.primary_category, '')) like '%religious organization%'
        or lower(coalesce(l.primary_category, '')) like '%religious center%'
        or lower(coalesce(l.primary_category, '')) like '%worship center%'
        or lower(coalesce(l.primary_category, '')) like '%spiritual center%'
        or lower(coalesce(l.primary_category, '')) like '%shrine%'
        or lower(coalesce(l.primary_category, '')) like '%ministry%'
        or lower(coalesce(l.primary_category, '')) like '%parish%'
        or lower(coalesce(l.primary_category, '')) like '%congregation%'
        or lower(coalesce(l.location_type, '')) like '%place of worship%'
        or lower(coalesce(l.location_type, '')) like '%religious%'
      )
    )
    and (
      p_domain not in ('restaurant', 'activity')
      or (
        p_domain = 'restaurant'
        and (
          l.restaurant_name is not null
          or l.cuisine is not null
          or l.cuisine_type is not null
          or lower(coalesce(l.location_type, '')) like '%restaurant%'
          or lower(coalesce(l.primary_category, '')) like '%restaurant%'
          or lower(coalesce(l.primary_category, '')) like '%dining%'
          or lower(coalesce(l.primary_category, '')) like '%cafe%'
          or lower(coalesce(l.primary_category, '')) like '%bakery%'
          or lower(coalesce(l.primary_category, '')) like '%bistro%'
          or lower(coalesce(l.primary_category, '')) like '%steakhouse%'
          or lower(coalesce(l.primary_category, '')) like '%bar and grill%'
          or lower(coalesce(l.primary_category, '')) like '%gastropub%'
        )
        and not (
          lower(coalesce(l.location_type, '')) like '%theater%'
          or lower(coalesce(l.location_type, '')) like '%theatre%'
          or lower(coalesce(l.location_type, '')) like '%cinema%'
          or lower(coalesce(l.primary_category, '')) like '%theater%'
          or lower(coalesce(l.primary_category, '')) like '%theatre%'
          or lower(coalesce(l.primary_category, '')) like '%cinema%'
          or lower(coalesce(l.primary_category, '')) like '%performing arts%'
          or lower(coalesce(l.activity_type, '')) like '%theater%'
          or lower(coalesce(l.activity_type, '')) like '%theatre%'
          or lower(coalesce(l.activity_type, '')) like '%cinema%'
          or lower(coalesce(l.name, '')) like '%theater%'
          or lower(coalesce(l.name, '')) like '%theatre%'
          or lower(coalesce(l.name, '')) like '%cinema%'
          or lower(array_to_string(coalesce(l.google_types, '{}'::text[]), ' ')) like '%movie_theater%'
          or lower(array_to_string(coalesce(l.google_types, '{}'::text[]), ' ')) like '%performing_arts%'
        )
        and not (
          l.restaurant_name is null
          and l.cuisine is null
          and l.cuisine_type is null
          and (
            lower(coalesce(l.primary_category, '')) like '%temple%'
            or lower(coalesce(l.primary_category, '')) like '%church%'
            or lower(coalesce(l.primary_category, '')) like '%mosque%'
            or lower(coalesce(l.primary_category, '')) like '%synagogue%'
            or lower(coalesce(l.primary_category, '')) like '%place of worship%'
            or lower(coalesce(l.primary_category, '')) like '%theater%'
            or lower(coalesce(l.primary_category, '')) like '%theatre%'
            or lower(coalesce(l.primary_category, '')) like '%movie theater%'
            or lower(coalesce(l.primary_category, '')) like '%cinema%'
            or lower(coalesce(l.primary_category, '')) like '%museum%'
            or lower(coalesce(l.primary_category, '')) like '%gallery%'
            or lower(coalesce(l.primary_category, '')) like '%park%'
            or lower(coalesce(l.primary_category, '')) like '%bowling%'
            or lower(coalesce(l.primary_category, '')) like '%arcade%'
            or lower(coalesce(l.primary_category, '')) like '%escape room%'
            or lower(coalesce(l.primary_category, '')) like '%karaoke%'
          )
        )
      )
      or (
        p_domain = 'activity'
        and (
          l.activity_name is not null
          or l.activity_type is not null
          or lower(coalesce(l.location_type, '')) like '%activity%'
          or lower(coalesce(l.primary_category, '')) like '%activity%'
          or lower(coalesce(l.primary_category, '')) like '%experience%'
          or lower(coalesce(l.primary_category, '')) like '%entertainment%'
          or lower(coalesce(l.primary_category, '')) like '%lounge%'
          or lower(coalesce(l.primary_category, '')) like '%hookah%'
          or lower(coalesce(l.primary_category, '')) like '%bowling%'
          or lower(coalesce(l.primary_category, '')) like '%museum%'
          or lower(coalesce(l.primary_category, '')) like '%theater%'
          or lower(coalesce(l.primary_category, '')) like '%theatre%'
          or lower(coalesce(l.primary_category, '')) like '%arcade%'
          or lower(coalesce(l.primary_category, '')) like '%karaoke%'
          or lower(coalesce(l.primary_category, '')) like '%gallery%'
          or lower(coalesce(l.primary_category, '')) like '%park%'
          or lower(coalesce(l.primary_category, '')) like '%spa%'
        )
      )
    )
), scored as (
  select c.*,
    (select coalesce(sum(case when lower(c.name) = lower(t) or lower(coalesce(c.restaurant_name,'')) = lower(t) or lower(coalesce(c.activity_name,'')) = lower(t) then 90 when lower(coalesce(c.primary_category,'')) like '%'||lower(t)||'%' or lower(coalesce(c.cuisine,'')) like '%'||lower(t)||'%' or lower(coalesce(c.cuisine_type,'')) like '%'||lower(t)||'%' or lower(coalesce(c.activity_type,'')) like '%'||lower(t)||'%' then 70 when c.haystack like '%'||lower(t)||'%' then 30 else 0 end),0) from unnest(coalesce(p_search_terms,array[]::text[])) t) as term_score_calc,
    case
      when p_domain='restaurant' and (
        c.haystack like '%theater%'
        or c.haystack like '%theatre%'
        or c.haystack like '%cinema%'
        or c.haystack like '%movie theater%'
        or c.haystack like '%movie_theater%'
        or c.haystack like '%performing arts%'
        or c.haystack like '%performing_arts%'
      ) then -999
      when p_domain='restaurant' and (
        c.restaurant_name is not null
        or c.cuisine is not null
        or c.cuisine_type is not null
        or lower(coalesce(c.location_type,'')) like '%restaurant%'
        or lower(coalesce(c.primary_category,'')) like '%restaurant%'
        or lower(coalesce(c.primary_category,'')) like '%dining%'
        or lower(coalesce(c.primary_category,'')) like '%cafe%'
        or lower(coalesce(c.primary_category,'')) like '%bakery%'
        or lower(coalesce(c.primary_category,'')) like '%bistro%'
        or lower(coalesce(c.primary_category,'')) like '%steakhouse%'
        or lower(coalesce(c.primary_category,'')) like '%bar and grill%'
        or lower(coalesce(c.primary_category,'')) like '%gastropub%'
      ) then 120
      when p_domain='activity' and (
        c.activity_name is not null
        or c.activity_type is not null
        or lower(coalesce(c.location_type,'')) like '%activity%'
        or lower(coalesce(c.primary_category,'')) like '%activity%'
        or lower(coalesce(c.primary_category,'')) like '%experience%'
        or lower(coalesce(c.primary_category,'')) like '%entertainment%'
        or lower(coalesce(c.primary_category,'')) like '%lounge%'
        or lower(coalesce(c.primary_category,'')) like '%hookah%'
        or lower(coalesce(c.primary_category,'')) like '%bowling%'
        or lower(coalesce(c.primary_category,'')) like '%museum%'
        or lower(coalesce(c.primary_category,'')) like '%theater%'
        or lower(coalesce(c.primary_category,'')) like '%theatre%'
        or lower(coalesce(c.primary_category,'')) like '%arcade%'
        or lower(coalesce(c.primary_category,'')) like '%karaoke%'
        or lower(coalesce(c.primary_category,'')) like '%gallery%'
        or lower(coalesce(c.primary_category,'')) like '%park%'
        or lower(coalesce(c.primary_category,'')) like '%spa%'
      ) then 120
      when p_domain='any' then 20
      else -200
    end as domain_score_calc,
    case when p_state is not null and c.state is not null and lower(c.state) <> lower(p_state) then -200 when p_neighborhood is not null and lower(coalesce(c.neighborhood,''))=lower(p_neighborhood) then 120 when p_borough is not null and lower(coalesce(c.borough,''))=lower(p_borough) then 90 when p_city is not null and lower(coalesce(c.city,''))=lower(p_city) then 80 when p_region='Long Island' and c.state='NY' and c.haystack ~ '(nassau|suffolk|hempstead|huntington|garden city|mineola|long beach)' then 75 when p_borough is not null or p_city is not null or p_neighborhood is not null or p_state is not null then -35 else 0 end as geo_score_calc,
    case when p_latitude is not null and p_longitude is not null and c.latitude is not null and c.longitude is not null then 3958.8 * acos(least(1, cos(radians(p_latitude::double precision)) * cos(radians(c.latitude::double precision)) * cos(radians(c.longitude::double precision) - radians(p_longitude::double precision)) + sin(radians(p_latitude::double precision)) * sin(radians(c.latitude::double precision)))) else null end as distance_miles_calc
  from candidates c
), final as (
  select s.*,
    case when distance_miles_calc is null then 0 when distance_miles_calc <= 1 then 35 when distance_miles_calc <= 3 then 25 when distance_miles_calc <= 5 then 15 when distance_miles_calc <= 8 then 5 when p_neighborhood is not null then -20 else -5 end as distance_score_calc,
    coalesce(s.theouthaven_score,s.quality_score,s.roseout_score,0)
      + coalesce(s.rating,0)*2
      + least(coalesce(s.review_count,0)::numeric/100,10)
      + case when coalesce(s.public_visibility_tier,'standard') = 'premium' then 250 when coalesce(s.public_visibility_tier,'standard') = 'curated' then 200 else 0 end
      + case when coalesce(s.curation_tier,'standard') = 'premium' then 250 when coalesce(s.curation_tier,'standard') in ('curated','date_worthy') then 200 else 0 end
      + case when coalesce(s.has_photos,false) = true and coalesce(s.photo_status,'') <> 'missing_photo' then 75 else -800 end
      + case when coalesce(s.is_low_level,false) = true then -1000 else 0 end
      + case when coalesce(s.public_visibility_tier,'standard') in ('low_level','hidden') then -700 else 0 end
      + case when coalesce(s.source_quality_status,'enriched') in ('imported_unverified','generic_restaurant') then -700 else 0 end as quality_rank_score_calc
  from scored s
)
select f.id, f.location_type, f.restaurant_name, f.activity_name, f.name, f.address, f.city, f.state, f.zip_code, f.neighborhood, f.borough, f.latitude, f.longitude, f.description, f.cuisine, f.cuisine_type, f.activity_type, f.primary_category, f.tags, f.vibe_tags, f.best_for_tags, f.date_style_tags, f.search_keywords, f.google_types, f.semantic_tags, f.intent_tags, f.search_document, f.semantic_search_text, f.rating, f.review_count, f.review_score, f.quality_score, f.popularity_score, f.roseout_score, f.theouthaven_score, null::numeric, f.recommendation_score, f.analytics_score, f.reservation_url, f.reservation_link, f.booking_url, f.external_reservation_url, f.website, f.phone, f.image_url, f.main_image, to_jsonb(f.images), to_jsonb(f.gallery_images), f.is_searchable, f.is_hidden, f.active, f.status, f.data_status, f.deleted_at,
  (f.term_score_calc + f.geo_score_calc + f.domain_score_calc + f.distance_score_calc + f.quality_rank_score_calc) as match_score,
  f.term_score_calc, f.geo_score_calc, f.distance_score_calc, round(f.distance_miles_calc::numeric,2), f.domain_score_calc, f.quality_rank_score_calc
from final f
where (f.term_score_calc > 0 or coalesce(array_length(p_search_terms,1),0)=0 or p_domain in ('any'))
order by match_score desc, term_score_calc desc, geo_score_calc desc, domain_score_calc desc, distance_score_calc desc, quality_rank_score_calc desc, f.theouthaven_score desc nulls last, f.rating desc nulls last, f.review_count desc nulls last
limit least(greatest(p_limit,1),100);
$$;

create or replace function public.enterprise_search_recovery(
  p_search_terms text[],
  p_domain text default 'any',
  p_neighborhood text default null,
  p_borough text default null,
  p_city text default null,
  p_county text default null,
  p_region text default null,
  p_state text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_radius_miles numeric default null,
  p_limit int default 80,
  p_allow_places_of_worship boolean default false
) returns table (
  id uuid, location_type text, restaurant_name text, activity_name text, name text, address text, city text, state text, zip_code text, neighborhood text, borough text, latitude numeric, longitude numeric, description text, cuisine text, cuisine_type text, activity_type text, primary_category text, tags text[], vibe_tags text[], best_for_tags text[], date_style_tags text[], search_keywords text[], google_types text[], semantic_tags text[], intent_tags text[], search_document text, semantic_search_text text, rating numeric, review_count integer, review_score numeric, quality_score numeric, popularity_score numeric, roseout_score numeric, theouthaven_score numeric, search_score numeric, recommendation_score numeric, analytics_score numeric, reservation_url text, reservation_link text, booking_url text, external_reservation_url text, website text, phone text, image_url text, main_image text, images jsonb, gallery_images jsonb, is_searchable boolean, is_hidden boolean, active boolean, status text, data_status text, deleted_at timestamptz, match_score numeric, term_score numeric, geo_score numeric, distance_score numeric, distance_miles numeric, domain_score numeric, quality_rank_score numeric
) language sql stable as $$
  select * from public.enterprise_search_locations(
    p_search_terms,
    p_domain,
    p_neighborhood,
    p_borough,
    p_city,
    p_county,
    p_region,
    p_state,
    p_latitude,
    p_longitude,
    p_radius_miles,
    p_limit,
    p_allow_places_of_worship,
    false
  );
$$;

create index if not exists locations_lower_name_idx on public.locations (lower(name));
create index if not exists locations_lower_restaurant_name_idx on public.locations (lower(restaurant_name));
create index if not exists locations_lower_activity_name_idx on public.locations (lower(activity_name));
create index if not exists locations_lower_city_idx on public.locations (lower(city));
create index if not exists locations_lower_neighborhood_idx on public.locations (lower(neighborhood));
create index if not exists locations_lower_borough_idx on public.locations (lower(borough));
create index if not exists locations_lower_state_idx on public.locations (lower(state));
create index if not exists locations_lower_primary_category_idx on public.locations (lower(primary_category));
create index if not exists locations_lower_cuisine_idx on public.locations (lower(cuisine));
create index if not exists locations_lower_cuisine_type_idx on public.locations (lower(cuisine_type));
create index if not exists locations_lower_activity_type_idx on public.locations (lower(activity_type));
create index if not exists locations_latitude_idx on public.locations (latitude);
create index if not exists locations_longitude_idx on public.locations (longitude);
create index if not exists locations_latitude_longitude_idx on public.locations (latitude, longitude);
create index if not exists locations_tags_gin_idx on public.locations using gin (tags);
create index if not exists locations_vibe_tags_gin_idx on public.locations using gin (vibe_tags);
create index if not exists locations_best_for_tags_gin_idx on public.locations using gin (best_for_tags);
create index if not exists locations_search_keywords_gin_idx on public.locations using gin (search_keywords);
create index if not exists locations_google_types_gin_idx on public.locations using gin (google_types);
create index if not exists locations_semantic_tags_gin_idx on public.locations using gin (semantic_tags);
create index if not exists locations_intent_tags_gin_idx on public.locations using gin (intent_tags);
create index if not exists locations_search_document_trgm_idx on public.locations using gin (search_document gin_trgm_ops);
create index if not exists locations_semantic_search_text_trgm_idx on public.locations using gin (semantic_search_text gin_trgm_ops);

grant execute on function public.enterprise_search_locations(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int) to authenticated;
grant execute on function public.enterprise_search_locations(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int) to service_role;
grant execute on function public.enterprise_search_recovery(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int) to authenticated;
grant execute on function public.enterprise_search_recovery(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int) to service_role;
grant execute on function public.enterprise_search_locations(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int, boolean) to authenticated;
grant execute on function public.enterprise_search_locations(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int, boolean) to service_role;
grant execute on function public.enterprise_search_recovery(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int, boolean) to authenticated;
grant execute on function public.enterprise_search_recovery(text[], text, text, text, text, text, text, text, numeric, numeric, numeric, int, boolean) to service_role;
