create table if not exists public.search_anchor_sync_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'all',
  market text,
  dry_run boolean not null default true,
  status text not null default 'completed',
  summary jsonb not null default '{}'::jsonb,
  requested_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.search_anchor_sync_actions (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.search_anchor_sync_runs(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  anchor_id uuid references public.search_anchors(id) on delete set null,
  action_type text not null,
  reason_code text not null,
  current_values jsonb not null default '{}'::jsonb,
  proposed_values jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create index if not exists search_anchor_sync_runs_created_idx on public.search_anchor_sync_runs(created_at desc);
create index if not exists search_anchor_sync_actions_run_idx on public.search_anchor_sync_actions(sync_run_id);
create index if not exists search_anchor_sync_actions_location_idx on public.search_anchor_sync_actions(location_id);

alter table public.search_anchor_sync_runs enable row level security;
alter table public.search_anchor_sync_actions enable row level security;

drop policy if exists search_anchor_sync_runs_admin_all on public.search_anchor_sync_runs;
create policy search_anchor_sync_runs_admin_all on public.search_anchor_sync_runs for all to authenticated using (public.search_anchor_is_admin()) with check (public.search_anchor_is_admin());

drop policy if exists search_anchor_sync_actions_admin_all on public.search_anchor_sync_actions;
create policy search_anchor_sync_actions_admin_all on public.search_anchor_sync_actions for all to authenticated using (public.search_anchor_is_admin()) with check (public.search_anchor_is_admin());
