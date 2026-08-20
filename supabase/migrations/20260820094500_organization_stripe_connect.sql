-- Stripe Connect state for organization-owned paid events.

alter table public.organizations
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_onboarding_status text not null default 'not_started',
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_updated_at timestamptz;

create unique index if not exists organizations_stripe_connect_account_unique
  on public.organizations(stripe_connect_account_id)
  where stripe_connect_account_id is not null;
