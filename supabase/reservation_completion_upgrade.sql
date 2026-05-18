-- TheOutHaven reservation completion upgrade.
-- Safe to run multiple times. Uses ALTER/CREATE IF NOT EXISTS and preserves legacy rows.

alter table if exists public.location_reservations add column if not exists status text default 'pending';
alter table if exists public.location_reservations add column if not exists party_size integer default 2;
alter table if exists public.location_reservations add column if not exists special_requests text;
alter table if exists public.location_reservations add column if not exists confirmation_code text;
alter table if exists public.location_reservations add column if not exists locked_until timestamptz;
alter table if exists public.location_reservations add column if not exists checked_in_at timestamptz;
alter table if exists public.location_reservations add column if not exists completed_at timestamptz;
alter table if exists public.location_reservations add column if not exists cancelled_at timestamptz;
alter table if exists public.location_reservations add column if not exists waitlist_position integer;
alter table if exists public.location_reservations add column if not exists source text default 'web';
alter table if exists public.location_reservations add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Backfill compatibility columns from older schema names when present.
do $$
begin
  if to_regclass('public.location_reservations') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'location_reservations' and column_name = 'special_request') then
      execute 'update public.location_reservations set special_requests = coalesce(special_requests, special_request) where special_requests is null';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'location_reservations' and column_name = 'arrived_at') then
      execute 'update public.location_reservations set checked_in_at = coalesce(checked_in_at, arrived_at) where checked_in_at is null';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'location_reservations' and column_name = 'customer_cancelled_at') then
      execute 'update public.location_reservations set cancelled_at = coalesce(cancelled_at, customer_cancelled_at) where cancelled_at is null';
    end if;
  end if;
end $$;

create index if not exists location_reservations_status_idx on public.location_reservations (status);
create index if not exists location_reservations_reservation_time_idx on public.location_reservations (reservation_time);
create index if not exists location_reservations_location_id_idx on public.location_reservations (location_id);
create index if not exists location_reservations_user_id_idx on public.location_reservations (user_id);

alter table if exists public.location_reservations drop constraint if exists location_reservations_status_check;
alter table if exists public.location_reservations
  add constraint location_reservations_status_check
  check (status in (
    'pending',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled',
    'no_show',
    'waitlisted',
    -- legacy statuses kept temporarily so existing dashboards/rows are not broken
    'arrived',
    'seated',
    'occupied',
    'declined'
  )) not valid;

create table if not exists public.location_capacity (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  day_of_week integer not null,
  open_time time,
  close_time time,
  slot_duration_minutes integer default 90,
  max_capacity integer default 100,
  max_party_size integer default 20,
  is_closed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (location_id, day_of_week)
);

create table if not exists public.reservation_slot_locks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  reservation_date date not null,
  reservation_time time not null,
  party_size integer default 2,
  locked_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists reservation_slot_locks_location_id_idx on public.reservation_slot_locks (location_id);
create index if not exists reservation_slot_locks_expires_at_idx on public.reservation_slot_locks (expires_at);

create table if not exists public.reservation_waitlist (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid references auth.users(id),
  reservation_date date not null,
  reservation_time time not null,
  party_size integer default 2,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text default 'waiting',
  created_at timestamptz default now()
);

alter table if exists public.reservation_waitlist add column if not exists user_id uuid references auth.users(id);
alter table if exists public.reservation_waitlist add column if not exists reservation_date date;
alter table if exists public.reservation_waitlist add column if not exists reservation_time time;
alter table if exists public.reservation_waitlist add column if not exists contact_name text;
alter table if exists public.reservation_waitlist add column if not exists contact_email text;
alter table if exists public.reservation_waitlist add column if not exists contact_phone text;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reservation_waitlist' and column_name = 'customer_name') then
    execute 'update public.reservation_waitlist set contact_name = coalesce(contact_name, customer_name) where contact_name is null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reservation_waitlist' and column_name = 'customer_phone') then
    execute 'update public.reservation_waitlist set contact_phone = coalesce(contact_phone, customer_phone) where contact_phone is null';
  end if;
end $$;

alter table if exists public.reservation_waitlist drop constraint if exists reservation_waitlist_status_check;
alter table if exists public.reservation_waitlist
  add constraint reservation_waitlist_status_check
  check (status in ('waiting', 'notified', 'booked', 'expired', 'cancelled', 'seated')) not valid;

create index if not exists reservation_waitlist_match_idx on public.reservation_waitlist (location_id, reservation_date, reservation_time, status, created_at);

alter table if exists public.location_capacity enable row level security;
alter table if exists public.reservation_slot_locks enable row level security;
alter table if exists public.reservation_waitlist enable row level security;

-- RLS policies are intentionally additive and conservative. Service-role APIs retain full access.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_slot_locks' and policyname = 'Users can manage their own slot locks') then
    create policy "Users can manage their own slot locks" on public.reservation_slot_locks
      for all using (auth.uid() = locked_by) with check (auth.uid() = locked_by);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_waitlist' and policyname = 'Users can read their own waitlist entries') then
    create policy "Users can read their own waitlist entries" on public.reservation_waitlist
      for select using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_waitlist' and policyname = 'Users can create their own waitlist entries') then
    create policy "Users can create their own waitlist entries" on public.reservation_waitlist
      for insert with check (auth.uid() = user_id or user_id is null);
  end if;
end $$;
