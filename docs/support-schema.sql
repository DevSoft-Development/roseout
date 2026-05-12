-- TheOutHaven support ticket system tables.
-- Run this in Supabase SQL before enabling support tickets in production.

create extension if not exists pgcrypto;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique,
  requester_name text,
  requester_email text not null,
  requester_phone text,
  assigned_admin_email text,
  assigned_admin_name text,
  topic text default 'General Support',
  subject text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  source text default 'support_form',
  public_access_token text not null unique,
  last_message_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_type text not null default 'creator',
  author_name text,
  author_email text,
  author_phone text,
  body text not null,
  created_at timestamptz not null default now()
);


-- If these tables already existed from an earlier draft, `create table if not exists`
-- will not add missing columns. These idempotent repair statements keep reruns safe.
-- They also make this block safe to run by itself after a partially failed setup.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid()
);

alter table public.support_tickets
  add column if not exists ticket_number text,
  add column if not exists requester_name text,
  add column if not exists requester_email text,
  add column if not exists requester_phone text,
  add column if not exists assigned_admin_email text,
  add column if not exists assigned_admin_name text,
  add column if not exists topic text default 'General Support',
  add column if not exists subject text,
  add column if not exists status text not null default 'open',
  add column if not exists priority text not null default 'normal',
  add column if not exists source text default 'support_form',
  add column if not exists public_access_token text,
  add column if not exists last_message_at timestamptz default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.support_ticket_messages
  add column if not exists ticket_id uuid,
  add column if not exists actor_type text not null default 'creator',
  add column if not exists author_name text,
  add column if not exists author_email text,
  add column if not exists author_phone text,
  add column if not exists body text,
  add column if not exists created_at timestamptz not null default now();

-- Add the foreign key when the messages table had to be repaired from a partial setup.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_ticket_messages_ticket_id_fkey'
      and conrelid = 'public.support_ticket_messages'::regclass
  ) then
    alter table public.support_ticket_messages
      add constraint support_ticket_messages_ticket_id_fkey
      foreign key (ticket_id)
      references public.support_tickets(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists support_tickets_ticket_number_key
  on public.support_tickets (ticket_number)
  where ticket_number is not null;

create unique index if not exists support_tickets_public_access_token_key
  on public.support_tickets (public_access_token)
  where public_access_token is not null;

create index if not exists support_tickets_requester_email_idx
  on public.support_tickets (requester_email);

create index if not exists support_tickets_last_message_at_idx
  on public.support_tickets (last_message_at desc);

create index if not exists support_ticket_messages_ticket_id_idx
  on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
