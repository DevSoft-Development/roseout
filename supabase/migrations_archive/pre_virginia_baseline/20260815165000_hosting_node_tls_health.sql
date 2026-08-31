alter table public.website_hosting_nodes
  add column if not exists caddy_status text,
  add column if not exists certbot_timer_status text,
  add column if not exists tls_status text,
  add column if not exists tls_wildcard boolean,
  add column if not exists tls_cert_subject text,
  add column if not exists tls_cert_expires_at timestamptz,
  add column if not exists tls_last_checked_at timestamptz,
  add column if not exists cert_last_renewed_at timestamptz;

create index if not exists website_hosting_nodes_tls_expiry_idx
  on public.website_hosting_nodes (tls_cert_expires_at);
