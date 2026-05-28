-- Business-owner QR/manual claim code flow support.
-- This migration reuses existing claim_code fields on locations/restaurants/activities
-- and ensures the claim request table used by the current application exists.

create table if not exists public.location_claim_requests (
  id uuid primary key default gen_random_uuid(),
  location_name text not null,
  location_type text not null,
  request_type text not null default 'Claim existing listing',
  website text null,
  address text null,
  city text null,
  state text null,
  zip_code text null,
  neighborhood text null,
  latitude double precision null,
  longitude double precision null,
  google_place_id text null,
  formatted_address text null,
  owner_name text not null,
  owner_email text not null,
  owner_phone text null,
  notes text null,
  status text not null default 'pending',
  verification_status text not null default 'code_verified',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.location_claim_requests
  add column if not exists verification_status text not null default 'code_verified',
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists reviewed_at timestamptz null,
  add column if not exists reviewed_by uuid null references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists location_claim_requests_status_idx
  on public.location_claim_requests(status);

create index if not exists location_claim_requests_owner_email_idx
  on public.location_claim_requests(lower(owner_email));

create index if not exists location_claim_requests_submitted_at_idx
  on public.location_claim_requests(submitted_at desc);

alter table public.location_claim_requests enable row level security;

drop policy if exists "location_claim_requests_insert_own_email" on public.location_claim_requests;
create policy "location_claim_requests_insert_own_email"
  on public.location_claim_requests
  for insert
  to authenticated
  with check (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "location_claim_requests_select_own_email" on public.location_claim_requests;
create policy "location_claim_requests_select_own_email"
  on public.location_claim_requests
  for select
  to authenticated
  using (lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Admin service-role/API code bypasses RLS for review and status updates.
