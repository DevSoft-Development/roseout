begin;

alter table public.gtm_creator_sources
  add column if not exists user_id uuid,
  add column if not exists slug text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists instagram_handle text,
  add column if not exists tiktok_handle text,
  add column if not exists youtube_url text,
  add column if not exists follower_count integer,
  add column if not exists primary_market text,
  add column if not exists niches text[] not null default '{}'::text[],
  add column if not exists application_status text not null default 'approved',
  add column if not exists program_tier text not null default 'creator_partner',
  add column if not exists referral_code text,
  add column if not exists referral_window_days integer not null default 90,
  add column if not exists commission_amount_cents integer not null default 9900,
  add column if not exists agreement_accepted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_account_api_version text,
  add column if not exists stripe_connect_onboarding_status text not null default 'not_started',
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists last_activity_at timestamptz;

alter table public.gtm_creator_sources
  drop constraint if exists gtm_creator_sources_application_status_check,
  add constraint gtm_creator_sources_application_status_check
    check (application_status in ('applied','approved','rejected','paused','inactive')),
  drop constraint if exists gtm_creator_sources_program_tier_check,
  add constraint gtm_creator_sources_program_tier_check
    check (program_tier in ('creator_partner','featured_creator','founding_creator')),
  drop constraint if exists gtm_creator_sources_referral_window_days_check,
  add constraint gtm_creator_sources_referral_window_days_check
    check (referral_window_days between 1 and 365),
  drop constraint if exists gtm_creator_sources_commission_amount_cents_check,
  add constraint gtm_creator_sources_commission_amount_cents_check
    check (commission_amount_cents between 0 and 1000000),
  drop constraint if exists gtm_creator_sources_stripe_connect_onboarding_status_check,
  add constraint gtm_creator_sources_stripe_connect_onboarding_status_check
    check (stripe_connect_onboarding_status in ('not_started','pending','restricted','ready'));

create unique index if not exists gtm_creator_sources_slug_idx
  on public.gtm_creator_sources(lower(slug)) where slug is not null;
create unique index if not exists gtm_creator_sources_referral_code_idx
  on public.gtm_creator_sources(lower(referral_code)) where referral_code is not null;
create index if not exists gtm_creator_sources_user_idx
  on public.gtm_creator_sources(user_id) where user_id is not null;
create index if not exists gtm_creator_sources_application_idx
  on public.gtm_creator_sources(application_status, status, updated_at desc);

alter table public.gtm_referrals
  add column if not exists creator_source_id uuid references public.gtm_creator_sources(id) on delete set null,
  add column if not exists first_touch_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists source_url text,
  add column if not exists rejection_reason text;

create index if not exists gtm_referrals_creator_status_idx
  on public.gtm_referrals(creator_source_id, status, created_at desc);
create index if not exists gtm_referrals_location_idx
  on public.gtm_referrals(referred_location_id, created_at desc);
create index if not exists gtm_referrals_subscription_idx
  on public.gtm_referrals(stripe_subscription_id) where stripe_subscription_id is not null;

create table if not exists public.creator_partner_commissions (
  id uuid primary key default gen_random_uuid(),
  creator_source_id uuid not null references public.gtm_creator_sources(id) on delete cascade,
  referral_id uuid not null references public.gtm_referrals(id) on delete restrict,
  location_id uuid references public.locations(id) on delete set null,
  amount_cents integer not null default 9900 check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'validating' check (status in ('validating','approved','payable','paid','reversed','needs_review')),
  stripe_invoice_id text,
  stripe_charge_id text,
  stripe_transfer_id text,
  qualifying_payment_at timestamptz not null,
  validation_ends_at timestamptz not null,
  approved_at timestamptz,
  payable_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  fraud_flags jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(referral_id)
);

create index if not exists creator_partner_commissions_status_idx
  on public.creator_partner_commissions(status, validation_ends_at, created_at);
create index if not exists creator_partner_commissions_creator_idx
  on public.creator_partner_commissions(creator_source_id, created_at desc);

alter table public.creator_partner_commissions enable row level security;
revoke all on public.creator_partner_commissions from anon, authenticated;

comment on table public.creator_partner_commissions is 'One-time creator referral commissions. Server-only; payouts are triggered after the validation period.';
comment on column public.gtm_creator_sources.commission_amount_cents is 'Default one-time commission for a new Essentials+ conversion. Initial program value is $99.';
comment on column public.gtm_creator_sources.referral_window_days is 'Number of days after a creator referral in which a first paid Essentials+ conversion qualifies.';

commit;
