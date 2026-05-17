-- TheOutHaven Pro reservation operations foundation.
-- Run in Supabase SQL editor or your migration pipeline before enabling the new dashboard in production.

create table if not exists public.layout_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  source_table text not null default 'restaurant',
  source_id uuid null,
  item_type text not null,
  item_name text not null,
  item_number text null,
  capacity integer not null default 2 check (capacity > 0),
  x_position numeric not null default 0,
  y_position numeric not null default 0,
  width numeric not null default 2,
  height numeric not null default 2,
  rotation numeric not null default 0,
  status text not null default 'available' check (status in ('available', 'reserved', 'occupied', 'cleaning', 'blocked', 'maintenance')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists layout_items_location_idx on public.layout_items (location_id, source_table, is_active, status);
create index if not exists layout_items_sort_idx on public.layout_items (location_id, sort_order, y_position, x_position);

create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid null,
  reservation_id uuid null,
  customer_phone text,
  message_type text not null,
  message_body text not null,
  provider text not null default 'twilio',
  provider_message_id text null,
  status text not null default 'queued',
  error_message text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists sms_logs_reservation_idx on public.sms_logs (reservation_id, created_at desc);
create index if not exists sms_logs_location_idx on public.sms_logs (location_id, created_at desc);

create table if not exists public.reservation_reminders (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  location_id uuid not null,
  reminder_type text not null check (reminder_type in ('reminder_24h', 'reminder_2h')),
  scheduled_for timestamptz not null,
  sent_at timestamptz null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists reservation_reminders_due_idx on public.reservation_reminders (status, scheduled_for);
create unique index if not exists reservation_reminders_unique_idx on public.reservation_reminders (reservation_id, reminder_type);

create table if not exists public.reservation_waitlist (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  customer_name text not null,
  customer_phone text not null,
  party_size integer not null default 2 check (party_size > 0),
  status text not null default 'waiting' check (status in ('waiting', 'notified', 'seated', 'cancelled', 'expired')),
  estimated_wait_minutes integer null,
  assigned_layout_item_id uuid null,
  created_at timestamptz not null default now(),
  notified_at timestamptz null,
  expires_at timestamptz null
);

create index if not exists reservation_waitlist_location_idx on public.reservation_waitlist (location_id, status, created_at);

create table if not exists public.reservation_activity_logs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid null,
  reservation_id uuid null,
  actor_id uuid null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reservation_activity_logs_location_idx on public.reservation_activity_logs (location_id, created_at desc);
create index if not exists reservation_activity_logs_reservation_idx on public.reservation_activity_logs (reservation_id, created_at desc);

-- Optional columns used by the premium operations UI. Safe no-op if they already exist.
alter table if exists public.location_reservations add column if not exists duration_minutes integer;
alter table if exists public.location_reservations add column if not exists turn_time_minutes integer;
alter table if exists public.location_reservations add column if not exists seated_at timestamptz;
alter table if exists public.location_reservations add column if not exists guest_notes text;
alter table if exists public.location_reservations add column if not exists vip_tag text;

-- Overbooking protection for exact duplicate starts; API also blocks true overlapping ranges.
create unique index if not exists location_reservations_no_duplicate_item_start_idx
  on public.location_reservations (location_id, location_type, bookable_item_id, reservation_date, reservation_time)
  where status in ('confirmed', 'arrived', 'seated', 'occupied');
