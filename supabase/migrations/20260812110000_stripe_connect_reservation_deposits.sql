alter table public.locations
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_onboarding_status text not null default 'not_started',
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_updated_at timestamptz;

create unique index if not exists locations_stripe_connect_account_unique
  on public.locations(stripe_connect_account_id) where stripe_connect_account_id is not null;

alter table public.location_reservations
  add column if not exists deposit_platform_fee_cents integer not null default 0,
  add column if not exists deposit_connected_account_id text,
  add column if not exists deposit_refund_id text,
  add column if not exists deposit_refunded_at timestamptz;

alter table public.payment_logs
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists processing_error text;

comment on column public.locations.stripe_connect_account_id is 'Stripe Express account that receives reservation deposit destination charges.';

-- Connect readiness never opts a location into deposits. The owner must explicitly
-- enable deposits and choose a positive amount in location settings.
alter table public.locations alter column deposits_enabled set default false;
update public.locations set deposits_enabled = false where deposits_enabled is null;
alter table public.locations alter column deposits_enabled set not null;
alter table public.locations drop constraint if exists locations_deposit_opt_in_check;
alter table public.locations add constraint locations_deposit_opt_in_check
  check (not deposits_enabled or coalesce(default_deposit_amount, 0) >= 0.50);
