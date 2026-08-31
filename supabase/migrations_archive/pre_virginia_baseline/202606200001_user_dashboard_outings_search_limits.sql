create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into public.app_settings(key,value)
values ('search_usage_limits','{"enabled":false,"guestWeeklyLimit":1,"freeUserWeeklyLimit":3,"paidUserWeeklyLimit":null,"betaUsersUnlimited":true,"adminUsersUnlimited":true,"window":"weekly","limitMode":"hard","upgradeCtaEnabled":true}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.search_usage_events (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null,
  guest_id text null,
  event_type text not null default 'search',
  route text not null default '/api/generate',
  query text null,
  allowed boolean not null default true,
  limit_reason text null,
  plan_key text null,
  created_at timestamptz not null default now()
);
create index if not exists search_usage_events_auth_created_idx on public.search_usage_events(auth_user_id, created_at desc);
create index if not exists search_usage_events_guest_created_idx on public.search_usage_events(guest_id, created_at desc);
create index if not exists search_usage_events_created_idx on public.search_usage_events(created_at desc);

create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_key text not null default 'free',
  status text not null default 'active',
  provider text null,
  provider_customer_id text null,
  provider_subscription_id text null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_subscriptions_user_idx on public.customer_subscriptions(user_id, status, created_at desc);

create table if not exists public.user_outings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  saved_plan_id uuid null,
  reservation_id uuid null,
  dedupe_key text null,
  source text not null default 'manual',
  status text not null default 'planning',
  title text null,
  prompt text null,
  outing_date timestamptz null,
  party_size integer null,
  restaurant_id uuid null,
  restaurant_name text null,
  restaurant_address text null,
  restaurant_image text null,
  restaurant_url text null,
  activity_id uuid null,
  activity_name text null,
  activity_address text null,
  activity_image text null,
  activity_url text null,
  plan_payload jsonb not null default '{}'::jsonb,
  reservation_payload jsonb not null default '{}'::jsonb,
  booked_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_outings_user_created_idx on public.user_outings(user_id, created_at desc);
create index if not exists user_outings_user_status_created_idx on public.user_outings(user_id, status, created_at desc);
create index if not exists user_outings_saved_plan_idx on public.user_outings(saved_plan_id);
create index if not exists user_outings_reservation_idx on public.user_outings(reservation_id);
create unique index if not exists user_outings_user_saved_plan_unique on public.user_outings(user_id, saved_plan_id) where saved_plan_id is not null;
create unique index if not exists user_outings_user_reservation_unique on public.user_outings(user_id, reservation_id) where reservation_id is not null;
create unique index if not exists user_outings_user_dedupe_unique on public.user_outings(user_id, dedupe_key) where dedupe_key is not null;

alter table public.user_profiles add column if not exists preferred_name text;
alter table public.user_profiles add column if not exists age_range text;
alter table public.user_profiles add column if not exists birthday_month integer;
alter table public.user_profiles add column if not exists birthday_day integer;
alter table public.user_profiles add column if not exists birthday_opt_in boolean not null default false;
alter table public.user_profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.user_profiles add column if not exists sms_opt_in boolean not null default false;
