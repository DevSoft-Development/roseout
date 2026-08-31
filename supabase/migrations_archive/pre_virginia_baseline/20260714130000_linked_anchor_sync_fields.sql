alter table public.search_anchors
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_status text not null default 'current',
  add column if not exists sync_error text,
  add column if not exists manual_override_fields text[] not null default '{}',
  add column if not exists source_updated_at timestamptz;

alter table public.search_anchors drop constraint if exists search_anchors_sync_status_check;
alter table public.search_anchors
  add constraint search_anchors_sync_status_check check (sync_status in ('current','needs_sync','missing_registry_anchor','missing_linked_location','disabled_source','stale'));

create unique index if not exists search_anchors_linked_location_unique_idx
  on public.search_anchors (linked_location_id)
  where linked_location_id is not null;

create index if not exists search_anchors_sync_status_idx on public.search_anchors(sync_status);
create index if not exists search_anchors_last_synced_at_idx on public.search_anchors(last_synced_at desc);
