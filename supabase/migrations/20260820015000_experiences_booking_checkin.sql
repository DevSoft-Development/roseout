-- First-party bookable Experiences with QR and fallback-code check-in.
create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete set null,
  location_id uuid null references public.locations(id) on delete set null,
  title text not null,
  description text null,
  category text null,
  image_url text null,
  venue_name text null,
  address text null,
  city text null,
  state text null,
  zip_code text null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 1440),
  min_party_size integer not null default 1 check (min_party_size > 0),
  max_party_size integer not null default 10 check (max_party_size >= min_party_size),
  price_per_person numeric(10,2) not null default 0 check (price_per_person >= 0),
  currency text not null default 'USD',
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  searchable boolean not null default false,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is not null)::int + (location_id is not null)::int <= 1)
);
create index if not exists experiences_public_idx on public.experiences(status, searchable, city);
create index if not exists experiences_org_idx on public.experiences(organization_id, created_at desc);
create index if not exists experiences_location_idx on public.experiences(location_id, created_at desc);

create table if not exists public.experience_slots (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists experience_slots_experience_idx on public.experience_slots(experience_id, starts_at);

create table if not exists public.experience_bookings (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  slot_id uuid not null references public.experience_slots(id) on delete restrict,
  customer_user_id uuid null references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text null,
  party_size integer not null check (party_size > 0),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed','no_show')),
  public_token text not null unique,
  checkin_code text not null unique,
  checked_in_count integer not null default 0 check (checked_in_count >= 0 and checked_in_count <= party_size),
  checked_in_at timestamptz null,
  email_delivery_status text not null default 'pending' check (email_delivery_status in ('pending','sent','failed','skipped')),
  sms_delivery_status text not null default 'pending' check (sms_delivery_status in ('pending','sent','failed','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experience_bookings_slot_idx on public.experience_bookings(slot_id, status);
create index if not exists experience_bookings_experience_idx on public.experience_bookings(experience_id, created_at desc);

create table if not exists public.experience_checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.experience_bookings(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  method text not null check (method in ('qr','code')),
  guest_count integer not null check (guest_count > 0),
  result text not null check (result in ('checked_in','fully_checked_in','already_checked_in','cancelled','invalid')),
  scanned_by uuid null references auth.users(id) on delete set null,
  scanned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists experience_checkins_booking_idx on public.experience_checkins(booking_id, scanned_at desc);

alter table public.experiences enable row level security;
alter table public.experience_slots enable row level security;
alter table public.experience_bookings enable row level security;
alter table public.experience_checkins enable row level security;

revoke all on public.experience_bookings, public.experience_checkins from anon, authenticated;
grant all on public.experiences, public.experience_slots, public.experience_bookings, public.experience_checkins to service_role;

drop policy if exists "Public published experiences" on public.experiences;
create policy "Public published experiences" on public.experiences for select to anon, authenticated using (status='published' and searchable=true);
drop policy if exists "Public open experience slots" on public.experience_slots;
create policy "Public open experience slots" on public.experience_slots for select to anon, authenticated using (status='open' and starts_at >= now() and exists (select 1 from public.experiences e where e.id=experience_id and e.status='published' and e.searchable=true));
