create extension if not exists pgcrypto;

create table if not exists communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('email','sms')),
  subject text,
  body text not null,
  category text,
  is_system boolean default false,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists communication_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','sms')),
  direction text not null check (direction in ('outbound','inbound')),
  from_address text,
  to_address text,
  recipient_type text,
  recipient_id text,
  subject text,
  body text,
  status text default 'sent',
  provider_message_id text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null,
  requester_email text not null,
  requester_name text,
  subject text not null,
  status text default 'open',
  priority text default 'normal',
  assigned_to uuid,
  source text default 'email',
  provider_thread_id text,
  provider_message_id text,
  last_message_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references support_tickets(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  from_address text,
  to_address text,
  subject text,
  body text not null,
  provider_message_id text,
  provider_thread_id text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

create index if not exists idx_support_tickets_requester_email on support_tickets(requester_email);
create index if not exists idx_support_tickets_provider_thread_id on support_tickets(provider_thread_id);
create index if not exists idx_support_tickets_status on support_tickets(status);
create index if not exists idx_support_tickets_created_at on support_tickets(created_at);
create index if not exists idx_support_ticket_messages_ticket_id on support_ticket_messages(ticket_id);
