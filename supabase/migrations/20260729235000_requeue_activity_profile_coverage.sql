-- Requeue searchable locations that are missing canonical profiles and rebuild
-- activity profiles that were generated without usable canonical terms.

insert into public.location_search_profile_refresh_queue (
  location_id,
  reason,
  status,
  available_at,
  created_at,
  updated_at
)
select
  l.id,
  case
    when p.location_id is null then 'activity_coverage_missing_profile'
    else 'activity_coverage_termless_profile'
  end,
  'queued',
  now(),
  now(),
  now()
from public.locations l
left join public.location_search_profiles p
  on p.location_id = l.id
where l.active = true
  and l.is_searchable = true
  and l.is_hidden = false
  and l.is_low_level = false
  and (
    p.location_id is null
    or (
      p.primary_domain = 'activity'
      and (
        coalesce(cardinality(p.canonical_terms), 0) = 0
        or coalesce(p.needs_review, false) = true
      )
    )
  )
on conflict (location_id, status)
do update set
  reason = excluded.reason,
  available_at = least(
    public.location_search_profile_refresh_queue.available_at,
    excluded.available_at
  ),
  updated_at = now();

comment on table public.location_search_profile_refresh_queue is
  'Durable queue for rebuilding canonical search profiles, including activity coverage recovery.';
