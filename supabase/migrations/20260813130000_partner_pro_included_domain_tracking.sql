alter table public.locations
  add column if not exists included_domain_name text,
  add column if not exists included_domain_claimed_at timestamptz,
  add column if not exists included_domain_status text,
  add column if not exists included_domain_registered_at timestamptz,
  add column if not exists included_domain_renewal_due_at timestamptz;

comment on column public.locations.included_domain_name is
  'Single included Partner Pro domain claimed by this location. One lifetime claim per location.';

comment on column public.locations.included_domain_claimed_at is
  'When this location permanently consumed its one included-domain benefit.';

comment on column public.locations.included_domain_status is
  'Lifecycle state for the included domain, such as pending, active, transfer_out, or expired.';

create index if not exists locations_included_domain_name_idx
  on public.locations (lower(included_domain_name))
  where included_domain_name is not null;
