alter table public.website_hosting_nodes
  add column if not exists role text not null default 'primary',
  add column if not exists deploy_url text;

alter table public.website_hosting_nodes
  drop constraint if exists website_hosting_nodes_role_check;

alter table public.website_hosting_nodes
  add constraint website_hosting_nodes_role_check
  check (role in ('primary', 'failover'));

alter table public.business_websites
  add column if not exists failover_source_node_id uuid references public.website_hosting_nodes(id) on delete set null,
  add column if not exists last_failover_at timestamptz;

create index if not exists website_hosting_nodes_role_capacity_idx
  on public.website_hosting_nodes (role, status, accepting_new_sites, name);

insert into public.website_hosting_nodes (
  name,
  provider,
  instance_name,
  region,
  public_ip,
  status,
  accepting_new_sites,
  max_sites,
  role,
  deploy_url
) values (
  'toh-web-failover-01-ohio',
  'lightsail',
  'toh-web-failover-01-ohio',
  'us-east-2',
  '18.227.1.183'::inet,
  'provisioning',
  false,
  20,
  'failover',
  null
)
on conflict (name) do update set
  provider = excluded.provider,
  instance_name = excluded.instance_name,
  region = excluded.region,
  public_ip = excluded.public_ip,
  role = excluded.role,
  updated_at = now();
