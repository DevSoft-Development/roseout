create table if not exists public.concierge_sms_context (
  phone_e164 text primary key,
  current_location_id uuid null references public.locations(id) on delete set null,
  candidate_location_ids uuid[] not null default '{}'::uuid[],
  last_intent text null,
  last_query text null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.concierge_sms_context enable row level security;
revoke all on table public.concierge_sms_context from anon, authenticated;
grant all on table public.concierge_sms_context to service_role;

create index if not exists concierge_sms_context_expires_idx
  on public.concierge_sms_context (expires_at);
