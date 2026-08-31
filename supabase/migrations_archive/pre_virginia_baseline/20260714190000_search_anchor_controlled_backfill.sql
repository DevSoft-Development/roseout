alter table public.search_anchor_sync_runs
  add column if not exists batch_size integer not null default 100,
  add column if not exists started_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists rolled_back_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_summary jsonb not null default '{}'::jsonb;

alter table public.search_anchor_sync_actions
  add column if not exists previous_values jsonb not null default '{}'::jsonb,
  add column if not exists executed_at timestamptz,
  add column if not exists rolled_back_at timestamptz,
  add column if not exists error_message text;

create unique index if not exists search_anchors_linked_location_unique
  on public.search_anchors(linked_location_id)
  where linked_location_id is not null;

create index if not exists search_anchor_sync_actions_status_idx
  on public.search_anchor_sync_actions(sync_run_id, status, created_at);

create index if not exists search_anchor_sync_runs_status_idx
  on public.search_anchor_sync_runs(status, created_at desc);
