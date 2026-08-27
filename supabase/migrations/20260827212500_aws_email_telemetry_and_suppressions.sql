-- AWS/SES provider telemetry is append-only and server-only.
-- Existing marketing_send_logs remains the delivery summary used by the admin UI.

create table if not exists public.email_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(trim(provider)) > 0),
  provider_event_id text not null check (length(trim(provider_event_id)) > 0),
  provider_message_id text,
  marketing_send_log_id uuid references public.marketing_send_logs(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  recipient_email text,
  event_type text not null check (length(trim(event_type)) > 0),
  diagnostic_code text,
  metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_email_provider_events_message
  on public.email_provider_events(provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_email_provider_events_send_log
  on public.email_provider_events(marketing_send_log_id, occurred_at desc)
  where marketing_send_log_id is not null;

create index if not exists idx_email_provider_events_campaign
  on public.email_provider_events(campaign_id, occurred_at desc)
  where campaign_id is not null;

create index if not exists idx_email_provider_events_recipient
  on public.email_provider_events(lower(recipient_email), occurred_at desc)
  where recipient_email is not null;

create index if not exists idx_email_provider_events_occurred
  on public.email_provider_events(occurred_at desc);

create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (position('@' in email) > 1),
  provider text not null check (length(trim(provider)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  source_event_id uuid references public.email_provider_events(id) on delete set null,
  active boolean not null default true,
  suppressed_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_email_suppressions_active_reason
  on public.email_suppressions(lower(email), provider, reason)
  where active;

create index if not exists idx_email_suppressions_active_email
  on public.email_suppressions(lower(email))
  where active;

alter table public.email_provider_events enable row level security;
alter table public.email_suppressions enable row level security;

revoke all on table public.email_provider_events from anon, authenticated;
revoke all on table public.email_suppressions from anon, authenticated;

grant all on table public.email_provider_events to service_role;
grant all on table public.email_suppressions to service_role;

comment on table public.email_provider_events is
  'Server-only append-only provider telemetry for SES/Resend email lifecycle events.';
comment on table public.email_suppressions is
  'Server-only email suppression registry populated by hard bounce, complaint, and manual controls.';
