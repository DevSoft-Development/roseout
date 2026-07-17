-- Verify that canonical search and location events are reaching analytics_events.
select
  event_name,
  search_id,
  anonymous_id,
  session_id,
  location_id,
  location_type,
  occurred_at,
  metadata
from public.analytics_events
where occurred_at >= now() - interval '1 hour'
  and event_name in (
    'search_started',
    'search_completed',
    'search_failed',
    'search_no_results',
    'search_results_impression',
    'location_impression',
    'location_clicked'
  )
order by occurred_at desc;

-- Confirm correlated search lifecycles.
select
  search_id,
  count(*) as event_count,
  array_agg(event_name order by occurred_at) as event_sequence,
  min(anonymous_id) as anonymous_id,
  min(session_id) as session_id,
  min(occurred_at) as first_event,
  max(occurred_at) as last_event
from public.analytics_events
where occurred_at >= now() - interval '1 hour'
  and search_id is not null
group by search_id
order by last_event desc;
