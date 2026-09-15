create table if not exists public.promotion_campaigns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  name text not null,
  promotion_type text not null default 'location' check (promotion_type in ('location','outing','event','experience')),
  placements text[] not null default array['discover']::text[],
  status text not null default 'draft' check (status in ('draft','pending_funding','scheduled','active','paused','completed','cancelled')),
  audience_mode text not null default 'auto' check (audience_mode in ('auto','manual')),
  targeting jsonb not null default '{}'::jsonb,
  creative jsonb not null default '{}'::jsonb,
  total_budget_cents integer not null default 0 check (total_budget_cents >= 0),
  daily_budget_cents integer check (daily_budget_cents is null or daily_budget_cents > 0),
  spent_cents integer not null default 0 check (spent_cents >= 0),
  discover_cpm_cents integer not null default 1200 check (discover_cpm_cents >= 0),
  search_cpc_cents integer not null default 200 check (search_cpc_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  funded_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotion_campaigns_location_idx on public.promotion_campaigns(location_id, created_at desc);
create index if not exists promotion_campaigns_delivery_idx on public.promotion_campaigns(status, starts_at, ends_at);
create index if not exists promotion_campaigns_placements_idx on public.promotion_campaigns using gin(placements);

create table if not exists public.promotion_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  location_id uuid not null,
  event_type text not null check (event_type in ('impression','click','profile_view','outing_open','save','reservation_click','call','booking','completed_outing')),
  placement text not null check (placement in ('discover','search')),
  session_key text,
  user_id uuid,
  search_event_id uuid,
  dedupe_key text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  revenue_cents integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists promotion_events_dedupe_idx on public.promotion_events(dedupe_key) where dedupe_key is not null;
create index if not exists promotion_events_campaign_idx on public.promotion_events(campaign_id, occurred_at desc);
create index if not exists promotion_events_location_idx on public.promotion_events(location_id, occurred_at desc);

create table if not exists public.promotion_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  location_id uuid not null,
  entry_type text not null check (entry_type in ('fund','spend','refund','credit','adjustment')),
  amount_cents integer not null,
  currency text not null default 'usd',
  event_id uuid references public.promotion_events(id) on delete set null,
  stripe_object_id text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists promotion_ledger_campaign_idx on public.promotion_ledger_entries(campaign_id, created_at desc);

create table if not exists public.promotion_attributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  location_id uuid not null,
  source_event_id uuid references public.promotion_events(id) on delete set null,
  conversion_type text not null check (conversion_type in ('reservation_click','call','booking','completed_outing')),
  conversion_id text,
  attributed_revenue_cents integer,
  attribution_model text not null default 'last_click_7d',
  attributed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists promotion_attributions_campaign_idx on public.promotion_attributions(campaign_id, attributed_at desc);

alter table public.promotion_campaigns enable row level security;
alter table public.promotion_events enable row level security;
alter table public.promotion_ledger_entries enable row level security;
alter table public.promotion_attributions enable row level security;

revoke all on table public.promotion_campaigns from anon, authenticated;
revoke all on table public.promotion_events from anon, authenticated;
revoke all on table public.promotion_ledger_entries from anon, authenticated;
revoke all on table public.promotion_attributions from anon, authenticated;

grant all on table public.promotion_campaigns to service_role;
grant all on table public.promotion_events to service_role;
grant all on table public.promotion_ledger_entries to service_role;
grant all on table public.promotion_attributions to service_role;
