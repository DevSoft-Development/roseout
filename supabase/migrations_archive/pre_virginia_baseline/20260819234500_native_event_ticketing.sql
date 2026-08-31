-- Native TheOutHaven event admission and QR ticketing.
-- Paid checkout remains a separate commerce domain; these tables own registration,
-- ticket issuance, delivery, and check-in state for first-party events.

alter table public.events
  add column if not exists ticketing_enabled boolean not null default false,
  add column if not exists capacity integer null,
  add constraint events_capacity_positive check (capacity is null or capacity > 0);

create table if not exists public.event_ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  purchaser_user_id uuid null references auth.users(id) on delete set null,
  purchaser_name text not null,
  purchaser_email text not null,
  purchaser_phone text null,
  quantity integer not null default 1 check (quantity between 1 and 10),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','refunded')),
  source text not null default 'public_registration',
  email_delivery_status text not null default 'pending' check (email_delivery_status in ('pending','sent','failed','skipped')),
  sms_delivery_status text not null default 'pending' check (sms_delivery_status in ('pending','sent','failed','skipped')),
  delivery_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_ticket_orders_event_idx on public.event_ticket_orders(event_id, created_at desc);
create index if not exists event_ticket_orders_email_idx on public.event_ticket_orders(lower(purchaser_email), created_at desc);

create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.event_ticket_orders(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  attendee_name text not null,
  attendee_email text not null,
  public_token text not null unique,
  status text not null default 'valid' check (status in ('valid','checked_in','void')),
  checked_in_at timestamptz null,
  checked_in_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_tickets_event_idx on public.event_tickets(event_id, created_at desc);
create index if not exists event_tickets_order_idx on public.event_tickets(order_id);
create index if not exists event_tickets_status_idx on public.event_tickets(event_id, status);

create table if not exists public.event_ticket_checkins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.event_tickets(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  scanned_by uuid null references auth.users(id) on delete set null,
  result text not null check (result in ('checked_in','already_checked_in','void','wrong_event','invalid')),
  scanned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists event_ticket_checkins_event_idx on public.event_ticket_checkins(event_id, scanned_at desc);
create index if not exists event_ticket_checkins_ticket_idx on public.event_ticket_checkins(ticket_id, scanned_at desc);

alter table public.event_ticket_orders enable row level security;
alter table public.event_tickets enable row level security;
alter table public.event_ticket_checkins enable row level security;

revoke all on public.event_ticket_orders from anon, authenticated;
revoke all on public.event_tickets from anon, authenticated;
revoke all on public.event_ticket_checkins from anon, authenticated;

grant all on public.event_ticket_orders, public.event_tickets, public.event_ticket_checkins to service_role;

comment on table public.event_ticket_orders is 'Server-only first-party event registrations/orders with email/SMS ticket delivery state. Paid checkout is handled separately.';
comment on table public.event_tickets is 'Server-only attendee admission tickets with unique QR tokens and check-in state.';
comment on table public.event_ticket_checkins is 'Immutable audit trail for organizer ticket scans and check-in outcomes.';
