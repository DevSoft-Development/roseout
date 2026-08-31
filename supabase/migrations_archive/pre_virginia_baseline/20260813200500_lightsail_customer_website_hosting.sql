create table if not exists public.website_hosting_nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider text not null default 'lightsail' check (provider = 'lightsail'),
  instance_name text not null unique,
  region text,
  public_ip inet,
  status text not null default 'provisioning' check (status in ('provisioning','healthy','degraded','offline','maintenance')),
  accepting_new_sites boolean not null default false,
  max_sites integer not null default 20 check (max_sites between 1 and 500),
  cpu_percent numeric(5,2) check (cpu_percent is null or (cpu_percent between 0 and 100)),
  memory_percent numeric(5,2) check (memory_percent is null or (memory_percent between 0 and 100)),
  disk_percent numeric(5,2) check (disk_percent is null or (disk_percent between 0 and 100)),
  last_health_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_websites (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references public.locations(id) on delete cascade,
  domain text not null,
  hosting_node_id uuid not null references public.website_hosting_nodes(id) on delete restrict,
  site_path text not null,
  status text not null default 'provisioning' check (status in ('provisioning','deploying','live','failed','suspended')),
  deployment_status text not null default 'pending' check (deployment_status in ('pending','deploying','deployed','failed')),
  deployment_version text,
  dns_status text not null default 'pending' check (dns_status in ('pending','configured','verified','failed')),
  ssl_status text not null default 'pending' check (ssl_status in ('pending','active','failed')),
  last_deployed_at timestamptz,
  last_health_check_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_websites_domain_lower_idx
  on public.business_websites (lower(domain));

create index if not exists business_websites_hosting_node_idx
  on public.business_websites (hosting_node_id, status);

create index if not exists website_hosting_nodes_capacity_idx
  on public.website_hosting_nodes (status, accepting_new_sites, name);

alter table public.website_hosting_nodes enable row level security;
alter table public.business_websites enable row level security;

revoke all on table public.website_hosting_nodes from public, anon, authenticated;
revoke all on table public.business_websites from public, anon, authenticated;
grant all on table public.website_hosting_nodes to service_role;
grant all on table public.business_websites to service_role;

insert into public.website_hosting_nodes (
  name,
  provider,
  instance_name,
  region,
  public_ip,
  status,
  accepting_new_sites,
  max_sites
) values (
  'toh-web-node-01',
  'lightsail',
  'toh-web-node-01',
  'us-east-1',
  '34.205.242.37'::inet,
  'provisioning',
  false,
  20
)
on conflict (name) do update set
  provider = excluded.provider,
  instance_name = excluded.instance_name,
  region = excluded.region,
  public_ip = excluded.public_ip,
  updated_at = now();
