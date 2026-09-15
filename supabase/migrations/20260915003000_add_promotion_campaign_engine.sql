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
  discover_cpm_cents integer not null default 1000 check (discover_cpm_cents >= 0),
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

create or replace function public.record_promotion_billable_event(
  p_campaign_id uuid,
  p_event_type text,
  p_placement text,
  p_session_key text,
  p_dedupe_key text,
  p_requested_amount_cents integer,
  p_revenue_cents integer default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.promotion_campaigns%rowtype;
  v_event_id uuid;
  v_charge integer := 0;
  v_remaining integer := 0;
begin
  select * into v_campaign
  from public.promotion_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'charged_cents', 0);
  end if;

  if v_campaign.status <> 'active'
     or (v_campaign.starts_at is not null and v_campaign.starts_at > now())
     or (v_campaign.ends_at is not null and v_campaign.ends_at < now())
     or not (p_placement = any(v_campaign.placements)) then
    return jsonb_build_object('ok', true, 'reason', 'not_deliverable', 'charged_cents', 0);
  end if;

  v_remaining := greatest(0, v_campaign.total_budget_cents - v_campaign.spent_cents);
  v_charge := least(greatest(0, coalesce(p_requested_amount_cents, 0)), v_remaining);

  if v_charge <= 0 then
    return jsonb_build_object('ok', true, 'reason', 'budget_exhausted', 'charged_cents', 0);
  end if;

  begin
    insert into public.promotion_events (
      campaign_id, location_id, event_type, placement, session_key, dedupe_key,
      amount_cents, revenue_cents, metadata
    ) values (
      v_campaign.id, v_campaign.location_id, p_event_type, p_placement, nullif(p_session_key, ''),
      nullif(p_dedupe_key, ''), v_charge, p_revenue_cents, coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_event_id;
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true, 'charged_cents', 0);
  end;

  insert into public.promotion_ledger_entries (
    campaign_id, location_id, entry_type, amount_cents, event_id, description, metadata
  ) values (
    v_campaign.id, v_campaign.location_id, 'spend', v_charge, v_event_id,
    case when p_placement = 'discover' then 'Qualified sponsored impression' else 'Qualified sponsored search engagement' end,
    jsonb_build_object('placement', p_placement, 'event_type', p_event_type)
  );

  update public.promotion_campaigns
  set spent_cents = spent_cents + v_charge,
      status = case when spent_cents + v_charge >= total_budget_cents then 'completed' else status end,
      completed_at = case when spent_cents + v_charge >= total_budget_cents then now() else completed_at end,
      updated_at = now()
  where id = v_campaign.id;

  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'charged_cents', v_charge);
end;
$$;

alter table public.promotion_campaigns enable row level security;
alter table public.promotion_events enable row level security;
alter table public.promotion_ledger_entries enable row level security;
alter table public.promotion_attributions enable row level security;

revoke all on table public.promotion_campaigns from anon, authenticated;
revoke all on table public.promotion_events from anon, authenticated;
revoke all on table public.promotion_ledger_entries from anon, authenticated;
revoke all on table public.promotion_attributions from anon, authenticated;
revoke all on function public.record_promotion_billable_event(uuid,text,text,text,text,integer,integer,jsonb) from public, anon, authenticated;

grant all on table public.promotion_campaigns to service_role;
grant all on table public.promotion_events to service_role;
grant all on table public.promotion_ledger_entries to service_role;
grant all on table public.promotion_attributions to service_role;
grant execute on function public.record_promotion_billable_event(uuid,text,text,text,text,integer,integer,jsonb) to service_role;
