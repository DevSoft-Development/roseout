begin;

alter table public.owner_lead_ml_features
  add column if not exists demand_score integer not null default 0,
  add column if not exists contactability_score integer not null default 0,
  add column if not exists activation_score integer not null default 0,
  add column if not exists business_gap_score integer not null default 0,
  add column if not exists business_quality_component integer not null default 0,
  add column if not exists demand_component integer not null default 0,
  add column if not exists engagement_component integer not null default 0,
  add column if not exists territory_component integer not null default 0,
  add column if not exists contactability_component integer not null default 0,
  add column if not exists opportunity_tier text,
  add column if not exists next_best_action text,
  add column if not exists association_level text not null default 'lightweight',
  add column if not exists gtm_status text not null default 'observed',
  add column if not exists score_explanation jsonb not null default '{}'::jsonb;

create table if not exists public.gtm_location_state (
  location_id uuid primary key references public.locations(id) on delete cascade,
  crm_account_id uuid references public.crm_accounts(id) on delete set null,
  association_level text not null default 'lightweight' check (association_level in ('lightweight','full')),
  gtm_status text not null default 'observed' check (gtm_status in ('observed','evaluated','qualified','sales_active','engaged','claiming','onboarding','customer','expansion','renewal','churn_risk','churned','suppressed')),
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  opportunity_tier text not null default 'low' check (opportunity_tier in ('hot','warm','developing','low')),
  demand_score integer not null default 0 check (demand_score between 0 and 100),
  contactability_score integer not null default 0 check (contactability_score between 0 and 100),
  activation_score integer not null default 0 check (activation_score between 0 and 100),
  score_explanation jsonb not null default '{}'::jsonb,
  next_best_action text,
  next_best_action_type text,
  first_touch_source text,
  last_touch_source text,
  assisted_sources text[] not null default '{}'::text[],
  suppressed boolean not null default false,
  suppression_reason text,
  qualified_at timestamptz,
  sales_activated_at timestamptz,
  last_signal_at timestamptz,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gtm_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  event_type text not null,
  channel text,
  source text,
  campaign_key text,
  creator_key text,
  referral_key text,
  postcard_batch_id uuid,
  actor_user_id uuid,
  value numeric,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.gtm_contact_discoveries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  contact_kind text not null check (contact_kind in ('email','phone','name','social')),
  contact_value text not null,
  contact_role text,
  source_url text not null,
  source_type text not null default 'official_website',
  confidence integer not null default 50 check (confidence between 0 and 100),
  verification_status text not null default 'discovered' check (verification_status in ('discovered','verified','invalid','stale','suppressed')),
  is_generic boolean not null default false,
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gtm_contact_discoveries_location_kind_value_idx
  on public.gtm_contact_discoveries(location_id, contact_kind, lower(contact_value));

create table if not exists public.gtm_score_history (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  opportunity_score integer not null,
  demand_score integer not null,
  contactability_score integer not null,
  activation_score integer not null,
  opportunity_tier text not null,
  explanation jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now()
);

create table if not exists public.gtm_channel_costs (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  campaign_key text,
  territory_id uuid references public.crm_territories(id) on delete set null,
  period_start date not null,
  period_end date not null,
  spend numeric not null default 0 check (spend >= 0),
  labor_cost numeric not null default 0 check (labor_cost >= 0),
  units integer not null default 0 check (units >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.gtm_creator_sources (
  id uuid primary key default gen_random_uuid(),
  creator_key text not null unique,
  display_name text not null,
  platform text,
  territory_id uuid references public.crm_territories(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gtm_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_key text not null unique,
  referring_account_id uuid references public.crm_accounts(id) on delete set null,
  referred_location_id uuid references public.locations(id) on delete set null,
  referred_account_id uuid references public.crm_accounts(id) on delete set null,
  status text not null default 'referred' check (status in ('referred','engaged','claimed','paid','expired','invalid')),
  attributed_mrr numeric not null default 0 check (attributed_mrr >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists gtm_location_state_priority_idx on public.gtm_location_state(suppressed, association_level, opportunity_score desc);
create index if not exists gtm_location_state_status_idx on public.gtm_location_state(gtm_status, opportunity_tier);
create index if not exists gtm_events_location_time_idx on public.gtm_events(location_id, occurred_at desc);
create index if not exists gtm_events_channel_time_idx on public.gtm_events(channel, occurred_at desc);
create index if not exists gtm_score_history_location_time_idx on public.gtm_score_history(location_id, calculated_at desc);

alter table public.gtm_location_state enable row level security;
alter table public.gtm_events enable row level security;
alter table public.gtm_contact_discoveries enable row level security;
alter table public.gtm_score_history enable row level security;
alter table public.gtm_channel_costs enable row level security;
alter table public.gtm_creator_sources enable row level security;
alter table public.gtm_referrals enable row level security;

revoke all on public.gtm_location_state, public.gtm_events, public.gtm_contact_discoveries, public.gtm_score_history, public.gtm_channel_costs, public.gtm_creator_sources, public.gtm_referrals from anon, authenticated;

commit;
