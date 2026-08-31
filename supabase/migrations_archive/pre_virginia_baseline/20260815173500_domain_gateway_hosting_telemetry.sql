alter table public.website_hosting_nodes
  add column if not exists node_role text not null default 'web' check (node_role in ('web','domain_gateway')),
  add column if not exists proxy_type text,
  add column if not exists proxy_status text,
  add column if not exists app_service_status text,
  add column if not exists app_health_status text,
  add column if not exists app_health_checked_at timestamptz,
  add column if not exists health_endpoint text;

update public.website_hosting_nodes
set node_role = 'web'
where node_role is distinct from 'web'
  and name <> 'theouthaven-domains-gateway';

insert into public.website_hosting_nodes (
  name,
  provider,
  instance_name,
  region,
  status,
  accepting_new_sites,
  max_sites,
  node_role,
  proxy_type,
  health_endpoint
) values (
  'theouthaven-domains-gateway',
  'lightsail',
  'theouthaven-domains-gateway',
  'us-east-1',
  'provisioning',
  false,
  1,
  'domain_gateway',
  'nginx',
  'http://127.0.0.1:3000/health'
)
on conflict (name) do update set
  provider = excluded.provider,
  instance_name = excluded.instance_name,
  region = excluded.region,
  accepting_new_sites = false,
  node_role = excluded.node_role,
  proxy_type = excluded.proxy_type,
  health_endpoint = excluded.health_endpoint,
  updated_at = now();

create index if not exists website_hosting_nodes_role_idx
  on public.website_hosting_nodes (node_role, status, name);
