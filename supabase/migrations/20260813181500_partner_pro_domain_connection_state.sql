alter table public.locations
  add column if not exists included_domain_connection_status text not null default 'not_started',
  add column if not exists included_domain_dns_configured_at timestamptz,
  add column if not exists included_domain_verification_checked_at timestamptz,
  add column if not exists included_domain_connected_at timestamptz;

alter table public.locations
  drop constraint if exists locations_included_domain_connection_status_check;

alter table public.locations
  add constraint locations_included_domain_connection_status_check
  check (included_domain_connection_status in ('not_started', 'pending_dns', 'pending_verification', 'connected', 'failed'));
