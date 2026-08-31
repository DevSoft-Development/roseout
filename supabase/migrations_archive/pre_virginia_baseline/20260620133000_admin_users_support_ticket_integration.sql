create extension if not exists pgcrypto;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique,
  user_id uuid null,
  email text null,
  requester_email text,
  requester_name text,
  name text null,
  subject text not null,
  category text null,
  priority text not null default 'normal',
  status text not null default 'open',
  source text not null default 'user_dashboard',
  related_outing_id uuid null,
  related_saved_plan_id uuid null,
  related_reservation_id uuid null,
  assigned_to uuid null,
  closed_at timestamptz null,
  last_message_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.support_tickets add column if not exists user_id uuid null;
alter table if exists public.support_tickets add column if not exists email text null;
alter table if exists public.support_tickets add column if not exists name text null;
alter table if exists public.support_tickets add column if not exists category text null;
alter table if exists public.support_tickets add column if not exists related_outing_id uuid null;
alter table if exists public.support_tickets add column if not exists related_saved_plan_id uuid null;
alter table if exists public.support_tickets add column if not exists related_reservation_id uuid null;
alter table if exists public.support_tickets add column if not exists closed_at timestamptz null;
alter table if exists public.support_tickets add column if not exists last_message_at timestamptz default now();
alter table if exists public.support_tickets alter column priority set default 'normal';
alter table if exists public.support_tickets alter column status set default 'open';
alter table if exists public.support_tickets alter column source set default 'user_dashboard';

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_user_id uuid null,
  sender_role text not null default 'user',
  direction text,
  from_address text,
  to_address text,
  subject text,
  message text,
  body text,
  internal_note boolean not null default false,
  provider_message_id text,
  provider_thread_id text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table if exists public.support_ticket_messages add column if not exists sender_user_id uuid null;
alter table if exists public.support_ticket_messages add column if not exists sender_role text not null default 'user';
alter table if exists public.support_ticket_messages add column if not exists message text null;
alter table if exists public.support_ticket_messages add column if not exists internal_note boolean not null default false;

create index if not exists idx_support_tickets_user_created on public.support_tickets(user_id, created_at desc);
create index if not exists idx_support_tickets_status_created on public.support_tickets(status, created_at desc);
create index if not exists idx_support_tickets_assigned_created on public.support_tickets(assigned_to, created_at desc);
create index if not exists idx_support_ticket_messages_ticket_created on public.support_ticket_messages(ticket_id, created_at asc);
