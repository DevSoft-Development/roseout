select count(*) filter(where l.is_searchable and l.active and not coalesce(l.is_hidden,false)) eligible_locations,count(p.*) profiles_generated,count(*) filter(where p.location_id is null) missing_profiles,count(*) filter(where p.profile_version<>3) stale_profiles,count(*) filter(where p.needs_review) needs_review,count(*) filter(where p.confidence<.5) low_confidence from public.locations l left join public.location_search_profiles p on p.location_id=l.id;
select primary_domain,count(*) from public.location_search_profiles group by 1 order by 2 desc;
select width_bucket(confidence,0,1,10) confidence_bucket,count(*) from public.location_search_profiles group by 1 order by 1;
select profile_version,count(*) from public.location_search_profiles group by 1 order by 1;
select reason,count(*) from public.location_search_profiles cross join lateral unnest(review_reasons) reason group by 1 order by 2 desc;
select count(*) filter(where status in ('pending','processing')) queue_depth,count(*) filter(where status='failed') failed_queue_items from public.location_search_profile_refresh_queue;
select status,count(*) from public.location_search_profile_runs group by 1;
select location_id from public.location_search_profiles where audiences&&array['family'] and audiences&&array['adult_only','twenty_one_plus'];
select location_id from public.location_search_profiles where meal_periods&&array['dinner'] and restaurant_categories&&array['cafe','bakery','dessert'] and not (canonical_terms&&array['full_service_dining']);
