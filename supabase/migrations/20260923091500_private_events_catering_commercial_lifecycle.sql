-- Extend the existing location_leads model into the Private Events + Catering commercial lifecycle.
-- Supporting audit history remains part of the same lead subsystem.

alter table public.location_leads
  add column if not exists commercial_stage text not null default 'lead',
  add column if not exists commercial_version integer not null default 1,
  add column if not exists proposal_status text not null default 'draft',
  add column if not exists proposal_payload jsonb not null default '{}'::jsonb,
  add column if not exists proposal_sent_at timestamptz,
  add column if not exists quote_subtotal_cents bigint not null default 0,
  add column if not exists quote_tax_cents bigint not null default 0,
  add column if not exists quote_total_cents bigint not null default 0,
  add column if not exists currency text not null default 'usd',
  add column if not exists contract_status text not null default 'not_started',
  add column if not exists contract_payload jsonb not null default '{}'::jsonb,
  add column if not exists contract_sent_at timestamptz,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists contract_signer_name text,
  add column if not exists contract_signer_email text,
  add column if not exists contract_signature_digest text,
  add column if not exists contract_signature_token_hash text,
  add column if not exists contract_signature_expires_at timestamptz,
  add column if not exists deposit_required_cents bigint not null default 0,
  add column if not exists deposit_paid_cents bigint not null default 0,
  add column if not exists deposit_status text not null default 'not_required',
  add column if not exists deposit_checkout_session_id text,
  add column if not exists deposit_payment_intent_id text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists balance_due_cents bigint not null default 0,
  add column if not exists balance_paid_cents bigint not null default 0,
  add column if not exists balance_status text not null default 'not_due',
  add column if not exists balance_checkout_session_id text,
  add column if not exists balance_payment_intent_id text,
  add column if not exists balance_paid_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists attribution_search_id uuid,
  add column if not exists attribution_session_id text,
  add column if not exists attribution_anonymous_id text,
  add column if not exists attribution_promotion_campaign_id uuid,
  add column if not exists attribution_channel_class text,
  add column if not exists attribution_context jsonb not null default '{}'::jsonb;

create index if not exists idx_location_leads_location_stage_created
  on public.location_leads(location_id, commercial_stage, created_at desc);
create index if not exists idx_location_leads_contract_token
  on public.location_leads(contract_signature_token_hash)
  where contract_signature_token_hash is not null;
create index if not exists idx_location_leads_deposit_pi
  on public.location_leads(deposit_payment_intent_id)
  where deposit_payment_intent_id is not null;
create index if not exists idx_location_leads_balance_pi
  on public.location_leads(balance_payment_intent_id)
  where balance_payment_intent_id is not null;
create index if not exists idx_location_leads_attribution_search
  on public.location_leads(attribution_search_id)
  where attribution_search_id is not null;
create index if not exists idx_location_leads_attribution_campaign
  on public.location_leads(attribution_promotion_campaign_id)
  where attribution_promotion_campaign_id is not null;

create table if not exists public.location_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.location_leads(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  actor_email text,
  actor_type text not null default 'system',
  from_stage text,
  to_stage text,
  amount_cents bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.location_lead_events enable row level security;
revoke all on table public.location_lead_events from public, anon, authenticated;
grant select, insert, update, delete on table public.location_lead_events to service_role;

create index if not exists idx_location_lead_events_lead_created
  on public.location_lead_events(lead_id, created_at desc);
create index if not exists idx_location_lead_events_location_created
  on public.location_lead_events(location_id, created_at desc);
