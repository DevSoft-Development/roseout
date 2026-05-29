-- Complete business claim code and owner onboarding support.
-- Safe/idempotent: reuses existing columns and only adds missing claim/owner fields.

alter table public.locations
  add column if not exists claim_code text,
  add column if not exists claim_token text,
  add column if not exists claim_url text,
  add column if not exists qr_link text,
  add column if not exists claim_qr_url text,
  add column if not exists qr_code_data_url text,
  add column if not exists claim_status text not null default 'unclaimed',
  add column if not exists claim_verification_status text not null default 'unverified',
  add column if not exists claimed_by uuid null references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz null,
  add column if not exists claimed_by_email text null,
  add column if not exists owner_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists owner_email text null,
  add column if not exists owner_name text null,
  add column if not exists owner_phone text null,
  add column if not exists plan text not null default 'free_discovery',
  add column if not exists is_pro boolean not null default false,
  add column if not exists reservation_settings jsonb not null default '{}'::jsonb;

alter table public.restaurants
  add column if not exists claim_status text not null default 'unclaimed',
  add column if not exists claim_verification_status text not null default 'unverified',
  add column if not exists claimed_by uuid null references auth.users(id) on delete set null,
  add column if not exists owner_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz null,
  add column if not exists claimed_by_email text null,
  add column if not exists owner_email text null,
  add column if not exists owner_name text null,
  add column if not exists owner_phone text null,
  add column if not exists plan text not null default 'free_discovery',
  add column if not exists is_pro boolean not null default false;

alter table public.activities
  add column if not exists claim_status text not null default 'unclaimed',
  add column if not exists claim_verification_status text not null default 'unverified',
  add column if not exists claimed_by uuid null references auth.users(id) on delete set null,
  add column if not exists owner_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz null,
  add column if not exists claimed_by_email text null,
  add column if not exists owner_email text null,
  add column if not exists owner_name text null,
  add column if not exists owner_phone text null,
  add column if not exists plan text not null default 'free_discovery',
  add column if not exists is_pro boolean not null default false;

create unique index if not exists locations_claim_code_unique_idx
  on public.locations (claim_code)
  where claim_code is not null;

create index if not exists locations_claim_owner_user_idx
  on public.locations (owner_user_id)
  where owner_user_id is not null;

create index if not exists locations_claimed_by_idx
  on public.locations (claimed_by)
  where claimed_by is not null;

create index if not exists locations_claim_status_idx
  on public.locations (claim_status);

create table if not exists public.business_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_table text null,
  source_location_id text null,
  claim_code text not null,
  status text not null default 'approved',
  verification_status text not null default 'code_verified',
  owner_email text not null,
  owner_phone text null,
  role_at_business text null,
  note text null,
  claimed_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id),
  unique (user_id, location_id)
);

create index if not exists business_claims_user_id_idx on public.business_claims(user_id);
create index if not exists business_claims_status_idx on public.business_claims(status);
create index if not exists business_claims_claim_code_idx on public.business_claims(claim_code);

alter table public.business_claims enable row level security;

drop policy if exists "business_claims_select_own" on public.business_claims;
create policy "business_claims_select_own"
  on public.business_claims
  for select
  to authenticated
  using (user_id = auth.uid());

-- Claim writes are performed by trusted server routes after auth + claim-code verification.

create table if not exists public.location_owner_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source_location_id text null,
  status text not null default 'active',
  role text null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, location_id)
);

create index if not exists location_owner_locations_user_id_idx on public.location_owner_locations(user_id);
create index if not exists location_owner_locations_location_id_idx on public.location_owner_locations(location_id);

alter table public.location_owner_locations enable row level security;

drop policy if exists "location_owner_locations_select_own" on public.location_owner_locations;
create policy "location_owner_locations_select_own"
  on public.location_owner_locations
  for select
  to authenticated
  using (user_id = auth.uid());

alter table public.location_claim_requests
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists location_id uuid null references public.locations(id) on delete set null,
  add column if not exists claim_code text null,
  add column if not exists claimed_at timestamptz null;

create index if not exists location_claim_requests_user_id_idx on public.location_claim_requests(user_id);
create index if not exists location_claim_requests_location_id_idx on public.location_claim_requests(location_id);
