-- Reservation Messaging V2 uses the canonical CRM communications model as a global core.
-- This migration safely adopts environments where the CRM Phase 4 tables already exist
-- and bootstraps the minimal canonical conversation/message tables where they do not.

create table if not exists public.crm_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null unique,
  channel text not null default 'support',
  status text not null default 'open',
  subject text,
  location_id uuid references public.locations(id) on delete set null,
  reservation_id uuid references public.location_reservations(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  assigned_team text,
  priority text not null default 'normal',
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  first_response_at timestamptz,
  is_unread boolean not null default false,
  unread_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.crm_conversations add column if not exists reservation_id uuid references public.location_reservations(id) on delete set null;
alter table public.crm_conversations add column if not exists is_unread boolean not null default false;
alter table public.crm_conversations add column if not exists unread_count integer not null default 0;
alter table public.crm_conversations add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.crm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  direction text not null,
  channel text not null,
  message_type text not null default 'message',
  sender_user_id uuid references auth.users(id) on delete set null,
  subject text,
  body_text text,
  body_html text,
  provider text,
  provider_message_id text,
  provider_thread_id text,
  status text not null default 'sent',
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  source_system text,
  source_record_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.crm_message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.crm_messages(id) on delete cascade,
  recipient_type text not null,
  address text not null,
  delivery_status text,
  provider_recipient_id text,
  consent_snapshot jsonb not null default '{}'::jsonb,
  suppression_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The application accesses these records through authenticated server routes and the
-- service-role client. No direct browser table access is required for Reserve.
alter table public.crm_conversations enable row level security;
alter table public.crm_messages enable row level security;
alter table public.crm_message_recipients enable row level security;

create index if not exists crm_conversations_reservation_idx on public.crm_conversations(reservation_id, last_message_at desc);
create index if not exists crm_conversations_location_unread_idx on public.crm_conversations(location_id, is_unread, last_message_at desc);
create index if not exists crm_messages_conversation_created_idx on public.crm_messages(conversation_id, created_at);
create index if not exists crm_messages_provider_thread_idx on public.crm_messages(provider, provider_thread_id) where provider_thread_id is not null;
create unique index if not exists crm_messages_provider_message_unique_idx on public.crm_messages(provider, provider_message_id) where provider_message_id is not null;
create unique index if not exists crm_messages_source_unique_idx on public.crm_messages(source_system, source_record_id) where source_system is not null and source_record_id is not null;
create index if not exists crm_message_recipients_address_idx on public.crm_message_recipients(lower(address), created_at desc);

-- Existing canonical CRM rows may predate the first-class reservation FK. Backfill it
-- from the metadata convention used by earlier communications work where possible.
update public.crm_conversations
set reservation_id = nullif(metadata->>'reservation_id', '')::uuid
where reservation_id is null
  and metadata ? 'reservation_id'
  and (metadata->>'reservation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
