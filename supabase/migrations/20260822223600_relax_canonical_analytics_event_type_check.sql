-- Canonical analytics events now carry a growing set of semantic event types
-- (search_started, search_results_impression, plan_click, website_click, etc.).
-- The legacy view/click-only check blocks valid production analytics writes.

alter table if exists public.analytics_events
  drop constraint if exists analytics_events_event_type_check;
