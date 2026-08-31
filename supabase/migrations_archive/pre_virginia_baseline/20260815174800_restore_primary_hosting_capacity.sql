update public.website_hosting_nodes
set
  role = 'primary',
  accepting_new_sites = true,
  updated_at = now()
where name = 'toh-web-node-01';

update public.website_hosting_nodes
set
  role = 'failover',
  accepting_new_sites = false,
  updated_at = now()
where name = 'toh-web-failover-01-ohio';

update public.website_hosting_nodes
set
  accepting_new_sites = false,
  updated_at = now()
where node_role = 'domain_gateway';
