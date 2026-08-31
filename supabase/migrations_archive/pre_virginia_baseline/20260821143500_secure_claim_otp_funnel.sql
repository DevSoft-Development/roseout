alter table public.location_claim_requests alter column owner_email drop not null;
alter table public.location_claim_requests add column if not exists verified_contact_channel text;
alter table public.location_claim_requests add column if not exists verified_contact text;
alter table public.location_claim_requests add column if not exists verified_contact_match boolean default false;

create table if not exists public.claim_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  claim_code_id uuid references public.location_claim_codes(id) on delete set null,
  claim_code text not null,
  channel text not null check (channel in ('email','sms')),
  contact_normalized text not null,
  contact_masked text not null,
  contact_match boolean not null default false,
  otp_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  send_count integer not null default 1,
  last_sent_at timestamptz not null default now(),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_claim_verification_location_created on public.claim_verification_challenges(location_id, created_at desc);
create index if not exists idx_claim_verification_contact_created on public.claim_verification_challenges(contact_normalized, created_at desc);
create index if not exists idx_claim_verification_ip_created on public.claim_verification_challenges(ip_hash, created_at desc) where ip_hash is not null;

create table if not exists public.claim_funnel_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  claim_code_id uuid references public.location_claim_codes(id) on delete set null,
  challenge_id uuid references public.claim_verification_challenges(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_claim_funnel_location_created on public.claim_funnel_events(location_id, created_at desc);
create index if not exists idx_claim_funnel_event_created on public.claim_funnel_events(event_type, created_at desc);

alter table public.claim_verification_challenges enable row level security;
alter table public.claim_funnel_events enable row level security;
revoke all on table public.claim_verification_challenges from anon, authenticated;
revoke all on table public.claim_funnel_events from anon, authenticated;
