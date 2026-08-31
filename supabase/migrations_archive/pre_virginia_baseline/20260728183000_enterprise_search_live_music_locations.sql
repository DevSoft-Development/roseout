create or replace function public.enterprise_search_live_music_locations(
  p_search_terms text[] default array['live music','music venue','jazz','concert','live band']::text[],
  p_neighborhood text default null,
  p_borough text default null,
  p_city text default null,
  p_county text default null,
  p_state text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_radius_miles numeric default null,
  p_limit int default 60
) returns setof public.locations
language sql
stable
security invoker
set search_path = public
as $$
  select l.*
  from public.locations l
  where l.deleted_at is null
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.active, true) = true
    and coalesce(l.is_searchable, true) = true
    and coalesce(l.is_low_level, false) = false
    and coalesce(l.has_photos, false) = true
    and coalesce(l.status, '') not in ('hidden','deleted','archived')
    and coalesce(l.data_status, 'clean') not in ('hidden','deleted','archived')
    and (
      lower(concat_ws(' ',
        l.name,
        l.activity_name,
        l.activity_type,
        l.primary_category,
        l.description,
        l.search_document,
        l.semantic_search_text,
        array_to_string(l.tags, ' '),
        array_to_string(l.search_keywords, ' '),
        array_to_string(l.semantic_tags, ' '),
        array_to_string(l.intent_tags, ' ')
      )) ~ '(live music|music venue|jazz club|jazz lounge|concert venue|performing arts venue|live band)'
      or lower(coalesce(l.activity_type, '')) ~ '(live music|music venue|jazz|concert)'
      or lower(coalesce(l.primary_category, '')) ~ '(live music|music venue|jazz|concert|performing arts)'
    )
    and (p_state is null or l.state is null or lower(l.state) = lower(p_state))
    and (p_borough is null or l.borough is null or lower(l.borough) = lower(p_borough))
    and (p_county is null or l.county is null or lower(l.county) = lower(p_county))
    and (
      (p_neighborhood is null and p_city is null)
      or lower(coalesce(l.neighborhood, '')) = lower(coalesce(p_neighborhood, ''))
      or lower(coalesce(l.city, '')) = lower(coalesce(p_city, ''))
      or (p_borough is not null and lower(coalesce(l.borough, '')) = lower(p_borough))
    )
  order by
    case when lower(coalesce(l.activity_type, '')) ~ '(live music|music venue|jazz|concert)' then 0 else 1 end,
    coalesce(l.theouthaven_score, l.quality_score, 0) desc,
    coalesce(l.rating, 0) desc,
    coalesce(l.review_count, 0) desc
  limit greatest(1, least(coalesce(p_limit, 60), 100));
$$;

grant execute on function public.enterprise_search_live_music_locations(text[], text, text, text, text, text, numeric, numeric, numeric, int) to anon, authenticated, service_role;
