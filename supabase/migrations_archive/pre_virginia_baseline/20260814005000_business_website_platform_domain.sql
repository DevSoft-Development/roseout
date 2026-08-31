alter table public.business_websites
  add column if not exists platform_domain text;

create unique index if not exists business_websites_platform_domain_unique
  on public.business_websites (lower(platform_domain))
  where platform_domain is not null;

comment on column public.business_websites.platform_domain is
  'Stable TheOutHaven-hosted subdomain used until or alongside a customer custom domain.';
