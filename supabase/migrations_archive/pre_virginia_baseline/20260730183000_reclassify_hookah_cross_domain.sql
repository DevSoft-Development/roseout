-- Rebuild only active, searchable locations with explicit hookah/shisha evidence.
-- Hookah is now an activity capability that may coexist with restaurant meal service.

with hookah_candidates as (
  select distinct l.id as location_id
  from public.locations l
  where l.active = true
    and l.is_searchable = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.is_low_level, false) = false
    and lower(
      concat_ws(
        ' ',
        l.name,
        l.restaurant_name,
        l.activity_name,
        l.location_type,
        l.activity_type,
        l.primary_category,
        l.category,
        l.description,
        array_to_string(l.tags, ' '),
        array_to_string(l.semantic_tags, ' '),
        array_to_string(l.intent_tags, ' '),
        array_to_string(l.search_keywords, ' ')
      )
    ) ~ '(hookah|shisha)'
), reset_existing as (
  update public.location_search_profile_refresh_queue q
  set
    reason = 'hookah_cross_domain_rebuild',
    status = 'pending',
    available_at = now(),
    updated_at = now()
  from hookah_candidates c
  where q.location_id = c.location_id
    and q.status in ('failed', 'completed')
  returning q.location_id
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
  'hookah_cross_domain_rebuild',
  'pending',
  now(),
  now()
from hookah_candidates c
where not exists (
  select 1
  from public.location_search_profile_refresh_queue q
  where q.location_id = c.location_id
    and q.status in ('pending', 'processing')
)
and not exists (
  select 1
  from reset_existing r
  where r.location_id = c.location_id
);
