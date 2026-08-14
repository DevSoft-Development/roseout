alter table public.website_hosting_nodes
  add column if not exists healthy_since timestamptz;

update public.website_hosting_nodes
set healthy_since = coalesce(healthy_since, last_health_check_at, updated_at, now())
where status = 'healthy'
  and healthy_since is null;

update public.website_hosting_nodes
set healthy_since = null
where status <> 'healthy'
  and healthy_since is not null;

create index if not exists website_hosting_nodes_failback_health_idx
  on public.website_hosting_nodes (status, healthy_since, last_health_check_at);
