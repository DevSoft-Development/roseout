create or replace function public.get_marketing_site_metrics(p_since timestamptz default (now() - interval '24 hours'))
returns jsonb
language sql
security definer
set search_path = public
as $$
with base as (
  select
    coalesce(nullif(session_id,''), nullif(anonymous_id,''), id::text) as visitor_key,
    coalesce(canonical_event_name, event_name, event_type) as event_key,
    page_path,
    metadata,
    created_at
  from public.analytics_events
  where created_at >= p_since
    and coalesce(is_bot, false) = false
),
create_sessions as (
  select distinct visitor_key from base where event_key = 'page_view' and page_path = '/create'
),
started as (
  select distinct b.visitor_key from base b join create_sessions c using (visitor_key)
  where b.event_key = 'search_started'
),
completed as (
  select distinct b.visitor_key from base b join started s using (visitor_key)
  where b.event_key in ('search_completed','search_results_impression')
),
engaged as (
  select distinct b.visitor_key from base b join completed c using (visitor_key)
  where b.event_key in ('location_clicked','result_clicked','pair_clicked','result_opened')
),
plan_reached as (
  select distinct b.visitor_key from base b join engaged e using (visitor_key)
  where b.page_path = '/plan'
),
plan_acted as (
  select distinct b.visitor_key from base b join plan_reached p using (visitor_key)
  where b.page_path = '/plan'
    and b.event_key in ('outing_created','reservation_started','website_clicked','directions_clicked','call_clicked','book_my_outing_clicked','outing_details_clicked')
),
session_duration as (
  select visitor_key,
         max(case when event_key = 'session_heartbeat' and (metadata->>'session_duration_seconds') ~ '^[0-9]+(\\.[0-9]+)?$'
                  then (metadata->>'session_duration_seconds')::numeric end) as seconds
  from base
  group by visitor_key
),
summary as (
  select
    count(*) filter (where event_key = 'page_view' and page_path = '/') as home_views,
    count(*) filter (where event_key = 'page_view' and page_path = '/create') as create_views,
    count(*) filter (where event_key = 'page_view' and page_path = '/plan') as plan_views,
    count(distinct visitor_key) as unique_sessions
  from base
)
select jsonb_build_object(
  'home_views', s.home_views,
  'create_views', s.create_views,
  'plan_views', s.plan_views,
  'unique_sessions', s.unique_sessions,
  'avg_session_seconds', coalesce((select round(avg(seconds)::numeric, 1) from session_duration where seconds is not null), 0),
  'funnel', jsonb_build_object(
    'create_viewed', (select count(*) from create_sessions),
    'search_started', (select count(*) from started),
    'search_completed', (select count(*) from completed),
    'result_engaged', (select count(*) from engaged),
    'plan_reached', (select count(*) from plan_reached),
    'plan_acted', (select count(*) from plan_acted)
  )
)
from summary s;
$$;

revoke all on function public.get_marketing_site_metrics(timestamptz) from public, anon, authenticated;
grant execute on function public.get_marketing_site_metrics(timestamptz) to service_role;
