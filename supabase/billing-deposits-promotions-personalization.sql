-- Business billing, deposits, promotions, and personalization extension.
-- Safe to re-run: every schema change is guarded by if not exists / to_regclass.

alter table if exists public.locations
  add column if not exists subscription_plan text default 'free',
  add column if not exists subscription_status text default 'free',
  add column if not exists current_period_end timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists deposits_enabled boolean default false,
  add column if not exists default_deposit_amount numeric default 0,
  add column if not exists deposit_type text default 'fixed',
  add column if not exists is_promoted boolean default false,
  add column if not exists promotion_tier text,
  add column if not exists promotion_starts_at timestamptz,
  add column if not exists promotion_ends_at timestamptz,
  add column if not exists promotion_budget numeric default 0,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

alter table if exists public.location_reservations
  add column if not exists deposit_required boolean default false,
  add column if not exists deposit_amount numeric default 0,
  add column if not exists deposit_status text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists refund_status text;

alter table if exists public.reservations
  add column if not exists deposit_required boolean default false,
  add column if not exists deposit_amount numeric default 0,
  add column if not exists deposit_status text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists refund_status text;

do $$
begin
  if to_regclass('public.location_reservations') is not null then
    alter table public.location_reservations
      drop constraint if exists location_reservations_deposit_status_check;

    alter table public.location_reservations
      add constraint location_reservations_deposit_status_check
      check (deposit_status is null or deposit_status in ('pending', 'paid', 'refunded', 'failed'));
  end if;

  if to_regclass('public.reservations') is not null then
    alter table public.reservations
      drop constraint if exists reservations_deposit_status_check;

    alter table public.reservations
      add constraint reservations_deposit_status_check
      check (deposit_status is null or deposit_status in ('pending', 'paid', 'refunded', 'failed'));
  end if;
end $$;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorite_cuisines text[] default '{}',
  favorite_neighborhoods text[] default '{}',
  favorite_outing_types text[] default '{}',
  average_budget text,
  nightlife_preference boolean default false,
  romantic_preference boolean default false,
  luxury_preference boolean default false,
  updated_at timestamptz default now()
);

create index if not exists locations_subscription_plan_idx on public.locations(subscription_plan);
create index if not exists locations_promoted_idx on public.locations(is_promoted, promotion_ends_at);
create index if not exists location_reservations_deposit_status_idx on public.location_reservations(deposit_status);
