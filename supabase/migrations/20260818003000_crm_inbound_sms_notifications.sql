-- Durable CRM inbound SMS routing and notifications.
-- This keeps unknown senders, supports first-contact routing by normalized phone,
-- and gives the admin CRM a dedicated notification source independent of task records.

create or replace function public.crm_phone_e164(value text)
returns text
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as digits
  )
  select case
    when digits ~ '^[0-9]{10}$' then '+1' || digits
    when digits ~ '^1[0-9]{10}$' then '+' || digits
    else null
  end
  from normalized;
$$;

alter table public.crm_contacts
  add column if not exists phone_e164 text;

update public.crm_contacts
set phone_e164 = public.crm_phone_e164(phone)
where phone_e164 is distinct from public.crm_phone_e164(phone);

create or replace function public.crm_contacts_sync_phone_e164()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.phone_e164 := public.crm_phone_e164(new.phone);
  return new;
end;
$$;

drop trigger if exists crm_contacts_sync_phone_e164 on public.crm_contacts;
create trigger crm_contacts_sync_phone_e164
before insert or update of phone on public.crm_contacts
for each row execute function public.crm_contacts_sync_phone_e164();

create index if not exists crm_contacts_phone_e164_idx
  on public.crm_contacts(phone_e164)
  where phone_e164 is not null and archived_at is null;

create table if not exists public.crm_message_notifications (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.crm_messages(id) on delete cascade,
  conversation_id uuid not null references public.crm_conversations(id) on delete cascade,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  notification_type text not null check (notification_type in ('inbound_sms','unmatched_sms','compliance_keyword')),
  severity text not null default 'normal' check (severity in ('normal','attention','urgent')),
  title text not null,
  body text,
  action_href text not null,
  routing_status text not null check (routing_status in ('matched','unmatched')),
  read_at timestamptz,
  read_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(message_id)
);

create index if not exists crm_message_notifications_unread_idx
  on public.crm_message_notifications(created_at desc)
  where read_at is null and dismissed_at is null;

create index if not exists crm_message_notifications_routing_idx
  on public.crm_message_notifications(routing_status, created_at desc)
  where dismissed_at is null;

alter table public.crm_message_notifications enable row level security;
drop policy if exists crm_admin_all on public.crm_message_notifications;
create policy crm_admin_all on public.crm_message_notifications
for all to authenticated
using (public.crm_is_admin())
with check (public.crm_is_admin());

comment on table public.crm_message_notifications is
  'Durable admin notification stream for inbound CRM communications, including unmatched SMS that must never be discarded.';
