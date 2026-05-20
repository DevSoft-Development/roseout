alter table if exists public.locations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_plan text default 'free',
  add column if not exists subscription_status text default 'inactive',
  add column if not exists current_period_end timestamptz,
  add column if not exists deposits_enabled boolean default false,
  add column if not exists default_deposit_amount numeric(10,2) default 0,
  add column if not exists deposit_type text default 'optional';

alter table if exists public.location_reservations
  add column if not exists deposit_required boolean default false,
  add column if not exists deposit_amount numeric(10,2),
  add column if not exists deposit_status text default 'unpaid',
  add column if not exists stripe_payment_intent_id text;

create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  stripe_event_id text,
  location_id text,
  payload jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);
