create table if not exists public.website_hosting_replicas (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.business_websites(id) on delete cascade,
  node_id uuid not null references public.website_hosting_nodes(id) on delete cascade,
  version integer not null,
  status text not null default 'pending',
  synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id, node_id)
);

alter table public.website_hosting_replicas
  drop constraint if exists website_hosting_replicas_status_check;

alter table public.website_hosting_replicas
  add constraint website_hosting_replicas_status_check
  check (status in ('pending', 'syncing', 'synced', 'failed', 'stale'));

create index if not exists website_hosting_replicas_node_status_idx
  on public.website_hosting_replicas (node_id, status, updated_at desc);

create index if not exists website_hosting_replicas_website_version_idx
  on public.website_hosting_replicas (website_id, version desc, status);

alter table public.website_hosting_replicas enable row level security;

revoke all on table public.website_hosting_replicas from anon, authenticated;
