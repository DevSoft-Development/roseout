-- Target only canonical profile gaps that map to known rollout failures.
-- This deliberately avoids a full profile rebuild.

with candidates as (
  select l.id as location_id
  from public.locations l
  left join public.location_search_profiles p on p.location_id = l.id
  where l.active = true
    and l.is_searchable = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.is_low_level, false) = false
    and (
      p.location_id is null
      or p.profile_version < 3
      or (
        coalesce(cardinality(p.activity_categories), 0) = 0
        and lower(concat_ws(' ', l.name, l.activity_name, l.activity_type, l.primary_category, l.category, l.description, array_to_string(l.tags, ' '), array_to_string(l.semantic_tags, ' '), array_to_string(l.search_keywords, ' ')))
          ~ '(art gallery|fine art gallery|art exhibition|karaoke|singing room|movie theater|movie theatre|cinema|escape room|escape game|mini golf|miniature golf|putt.?putt|family entertainment center|family fun center)'
      )
      or (
        coalesce(cardinality(p.nightlife_categories), 0) = 0
        and lower(concat_ws(' ', l.name, l.activity_name, l.activity_type, l.primary_category, l.category, l.description, array_to_string(l.tags, ' '), array_to_string(l.semantic_tags, ' '), array_to_string(l.search_keywords, ' ')))
          ~ '(hookah|shisha|hookah lounge|hookah bar|shisha lounge|rooftop bar|rooftop lounge|cocktail lounge)'
      )
      or (
        p.supported_domains @> array['activity']::text[]
        and coalesce(cardinality(p.activity_categories), 0) = 0
        and coalesce(cardinality(p.nightlife_categories), 0) = 0
      )
    )
)
insert into public.location_search_profile_refresh_queue (
  location_id,
  reason,
  status,
  available_at,
  updated_at
)
select
  c.location_id,
  'strict_replay_profile_gap',
  'pending',
  now(),
  now()
from candidates c
where not exists (
  select 1
  from public.location_search_profile_refresh_queue q
  where q.location_id = c.location_id
    and q.status in ('pending', 'processing')
);
