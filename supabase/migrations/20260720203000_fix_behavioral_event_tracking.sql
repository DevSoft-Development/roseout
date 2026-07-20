begin;

-- Preserve the legacy business event_type values while exposing a canonical
-- event_name that search learning can consume consistently.
create or replace function public.normalize_location_analytics_event_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.event_name := case
    when new.metadata->>'location_event_type' = 'click' then 'location_clicked'
    when new.metadata->>'location_event_type' = 'save' then 'location_saved'
    when new.metadata->>'location_event_type' = 'view' then 'location_viewed'
    when new.metadata->>'location_event_type' = 'booking' then 'reservation_completed'
    when new.metadata->