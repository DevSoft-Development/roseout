-- Private Events E2E lifecycle on the existing location_leads model.
-- Reuses canonical marketing_attribution_events via lead_id; no duplicate lead/attribution subsystem.

alter table public.location_leads
  add column if not exists proposal_title text,
  add column if not exists proposal_description text,
  add column if not exists proposal_payload jsonb not null default '{}'::jsonb,
  add column if not exists proposal_amount_cents bigint,
  add column if not exists proposal_currency text not null default 'usd',
  add column if not exists proposal_version integer not null default 0,
  add column if not exists proposal_sent_at timestamptz,
  add column if not exists proposal_expires_at timestamptz,
  add column if not exists contract_terms text,
  add column if not exists contract_status text not null default 'draft',
  add column if not exists contract_sent_at timestamptz,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists contract_signer_name text,
  add column if not exists contract_signer_email text,
  add column if not exists contract_signature_ip_hash text,
  add column if not exists deposit_amount_cents bigint not null default 0,
  add column if not exists deposit_status text not null default 'not_required',
  add column if not exists deposit_checkout_session_id text,
  add column if not exists deposit_payment_intent_id text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists balance_amount_cents bigint not null default 0,
  add column if not exists balance_status text not null default 'not_required',
  add column if not exists balance_checkout_session_id text,
  add column if not exists balance_payment_intent_id text,
  add column if not exists balance_paid_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists public_token_expires_at timestamptz not null default (now() + interval '180 days'),
  add column if not exists attribution_search_id uuid,
  add column if not exists attribution_session_id text,
  add column if not exists attribution_anonymous_id text,
  add column if not exists attribution_promotion_campaign_id uuid,
  add column if not exists attribution_source_event_id uuid,
  add column if not exists attribution_channel_class text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='location_leads_contract_status_check') then
    alter table public.location_leads add constraint location_leads_contract_status_check
      check (contract_status in ('draft','sent','signed','void'));
  end if;
  if not exists (select 1 from pg_constraint where conname='location_leads_deposit_status_check') then
    alter table public.location_leads add constraint location_leads_deposit_status_check
      check (deposit_status in ('not_required','pending','paid','failed','refunded'));
  end if;
  if not exists (select 1 from pg_constraint where conname='location_leads_balance_status_check') then
    alter table public.location_leads add constraint location_leads_balance_status_check
      check (balance_status in ('not_required','pending','paid','failed','refunded'));
  end if;
  if not exists (select 1 from pg_constraint where conname='location_leads_attribution_channel_check') then
    alter table public.location_leads add constraint location_leads_attribution_channel_check
      check (attribution_channel_class is null or attribution_channel_class in ('organic','sponsored','owned','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname='location_leads_amounts_nonnegative_check') then
    alter table public.location_leads add constraint location_leads_amounts_nonnegative_check
      check (coalesce(proposal_amount_cents,0) >= 0 and deposit_amount_cents >= 0 and balance_amount_cents >= 0);
  end if;
end $$;

create unique index if not exists idx_location_leads_public_token
  on public.location_leads(public_token);
create index if not exists idx_location_leads_location_type_status_updated
  on public.location_leads(location_id, lead_type, status, updated_at desc);
create index if not exists idx_location_leads_location_contract
  on public.location_leads(location_id, contract_status, updated_at desc);
create index if not exists idx_location_leads_location_payments
  on public.location_leads(location_id, deposit_status, balance_status, updated_at desc);
create index if not exists idx_location_leads_attribution_search
  on public.location_leads(attribution_search_id)
  where attribution_search_id is not null;
create index if not exists idx_location_leads_attribution_campaign
  on public.location_leads(attribution_promotion_campaign_id)
  where attribution_promotion_campaign_id is not null;

alter table public.marketing_attribution_events
  add column if not exists lead_id uuid references public.location_leads(id) on delete set null;

create index if not exists idx_marketing_attribution_events_lead
  on public.marketing_attribution_events(lead_id, occurred_at desc)
  where lead_id is not null;
