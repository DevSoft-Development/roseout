-- OPTIONAL — REVIEW BEFORE RUNNING
insert into public.analytics_events (event_name, location_id, source_location_id, user_id, query, metadata, created_at)
select 'reserve_clicked', null, rie.location_id::text, rie.user_id, rie.query, coalesce(rie.metadata, '{}'::jsonb), rie.created_at
from public.reservation_interest_events rie;
