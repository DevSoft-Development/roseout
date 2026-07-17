begin;

alter table public.analytics_events
  alter column item_id drop not null,
  alter column item_type drop not null,
  alter column event_type drop not null;

comment on column public.analytics_events.item_id is
  'Legacy item identifier. Nullable for canonical search and platform events.';

comment on column public.analytics_events.item_type is
  'Legacy item type. Nullable for canonical search and platform events.';

comment on column public.analytics_events.event_type is
  'Legacy event type. Canonical writers use event_name; nullable for compatibility.';

commit;
