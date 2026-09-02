alter table public.business_websites
  add column if not exists failover_lease_token uuid,
  add column if not exists failover_lease_expires_at timestamptz;

create index if not exists business_websites_failover_lease_idx
  on public.business_websites(failover_lease_expires_at)
  where failover_lease_token is not null;

comment on column public.business_websites.failover_lease_token is
  'Opaque owner token for website failover/failback/routing mutations.';
comment on column public.business_websites.failover_lease_expires_at is
  'Expiration for the website mutation lease; another runner may reclaim only after this timestamp.';
