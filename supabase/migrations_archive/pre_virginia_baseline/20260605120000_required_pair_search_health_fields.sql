alter table public.search_health_events
  add column if not exists required_pairing_suppressed_fallback boolean,
  add column if not exists required_pairing_failure_reason text;

create index if not exists idx_search_health_events_required_pairing_suppressed
on public.search_health_events(required_pairing_suppressed_fallback)
where required_pairing_suppressed_fallback is true;

create index if not exists idx_search_health_events_required_pairing_failure_reason
on public.search_health_events(required_pairing_failure_reason);
