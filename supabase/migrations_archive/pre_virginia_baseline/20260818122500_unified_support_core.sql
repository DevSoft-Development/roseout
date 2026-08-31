-- Unified TheOutHaven support core.
-- One ticket model for users, locations, CRM/admin, and employee workspaces.

alter table if exists public.support_tickets
  add column if not exists location_id uuid null,
  add column if not exists requester_type text not null default 'user',
  add column if not exists assigned_group text null,
  add column if not exists assigned_admin_email text null,
  add column if not exists assigned_admin_name text null,
  add column if not exists first_response_at timestamptz null,
  add column if not exists resolved_at timestamptz null,
  add column if not exists reopened_at timestamptz null,
  add column if not exists escalated_at timestamptz null,
  add column if not exists sla_first_response_due_at timestamptz null,
  add column if not exists sla_resolution_due_at timestamptz null,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.support_ticket_messages
  add column if not exists actor_type text null,
  add column if not exists author_name text null,
  add column if not exists author_email text null,
  add column if not exists author_phone text null,
  add column if not exists body text null,
  add column if not exists direction text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_support_tickets_location_created
  on public.support_tickets(location_id, created_at desc);

create index if not exists idx_support_tickets_group_status
  on public.support_tickets(assigned_group, status, updated_at desc);

create index if not exists idx_support_tickets_sla_first_response
  on public.support_tickets(sla_first_response_due_at)
  where first_response_at is null and status not in ('resolved', 'closed');

create index if not exists idx_support_tickets_sla_resolution
  on public.support_tickets(sla_resolution_due_at)
  where status not in ('resolved', 'closed');

-- Normalize legacy states without discarding historical meaning.
update public.support_tickets set status = 'resolved' where status in ('complete', 'completed');
update public.support_tickets set status = 'waiting_on_customer' where status = 'waiting';

-- Support tickets are server-mediated today. Keep RLS enabled as defense in depth.
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

comment on column public.support_tickets.location_id is 'Canonical location associated with a location-account support case.';
comment on column public.support_tickets.requester_type is 'user, location, employee, admin, or system.';
comment on column public.support_tickets.assigned_group is 'Support routing group such as customer_support, location_success, technical_support, billing, or reservations.';
