-- Seed Location Intelligence V2 review cadence without making provider calls.
-- The worker submits only when explicitly run; this migration only schedules future due dates.

insert into public.location_review_refresh_state(
  location_id,
  provider,
  popularity_score,
  next_refresh_at,
  refresh_enabled,
  metadata,
  updated_at
)
select
  l.id,
  'dataforseo',
  greatest(0, least(100, coalesce(l.popularity_score, 0))),
  case
    when coalesce(l.popularity_score, 0) >= 90 then now() + interval '30 days'
    when coalesce(l.popularity_score, 0) >= 70 then now() + interval '60 days'
    when coalesce(l.popularity_score, 0) >= 40 then now() + interval '90 days'
    when coalesce(l.popularity_score, 0) >= 10 then now() + interval '180 days'
    else null
  end,
  coalesce(l.popularity_score, 0) >= 10,
  jsonb_build_object('seed','location_intelligence_v2','incrementalOnly',true),
  now()
from public.locations l
where exists (
  select 1
  from public.location_external_identities e
  where e.location_id = l.id
    and e.provider = 'google'
    and e.is_current = true
    and e.status = 'active'
)
on conflict (location_id, provider) do nothing;
