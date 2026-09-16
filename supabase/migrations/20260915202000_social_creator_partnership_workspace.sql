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
alter table public.gtm_creator_sources enable row level security;
revoke all on public.gtm_creator_sources from anon,authenticated;

create table if not exists public.social_creator_partnerships (
  id uuid primary key default gen_random_uuid(),
  creator_source_id uuid not null references public.gtm_creator_sources(id) on delete cascade,
  status text not null default 'new' check (status in ('new','contacted','interested','working_together','not_a_fit','completed')),
  campaign_name text,
  payment_model text not null default 'custom' check (payment_model in ('flat','per_business','commission','hybrid','custom')),
  flat_fee numeric(12,2) check (flat_fee is null or flat_fee>=0),
  per_business_fee numeric(12,2) check (per_business_fee is null or per_business_fee>=0),
  commission_percent numeric(6,2) check (commission_percent is null or (commission_percent>=0 and commission_percent<=100)),
  commission_months integer check (commission_months is null or commission_months>0),
  tracking_key text unique,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(creator_source_id,campaign_name)
);
alter table public.social_creator_partnerships enable row level security;
revoke all on public.social_creator_partnerships from anon,authenticated;
create index if not exists social_creator_partnerships_status_idx on public.social_creator_partnerships(status,updated_at desc);
