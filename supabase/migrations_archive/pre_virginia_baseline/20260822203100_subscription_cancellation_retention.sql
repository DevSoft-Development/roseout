create table if not exists public.subscription_cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid null,
  stripe_subscription_id text null,
  reason_code text not null,
  reason_text text null,
  tenure_months integer not null default 0,
  offered_discount_percent integer null,
  offered_discount_months integer null,
  offer_accepted boolean not null default false,
  cancellation_scheduled boolean not null default false,
  current_period_end timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_cancellation_feedback_location_created_idx
  on public.subscription_cancellation_feedback(location_id, created_at desc);

alter table public.subscription_cancellation_feedback enable row level security;
