-- TheOutHaven Organizer + Organization Verification Foundation
-- Additive trust layer. Financial/KYC verification is intentionally out of scope.

create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  display_name text not null,
  bio text null,
  website text null,
  instagram text null,
  phone text null,
  verification_status text not null default 'unverified',
  trust_level integer not null default 0,
  publishing_status text not null default 'review_required',
  phone_verified boolean not null default false,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_profiles_display_name_not_blank check (length(trim(display_name)) > 0),
  constraint organizer_profiles_verification_check check (verification_status in ('unverified','pending','verified','rejected','suspended')),
  constraint organizer_profiles_trust_level_check check (trust_level between 0 and 5),
  constraint organizer_profiles_publishing_check check (publishing_status in ('disabled','review_required','trusted'))
);

create index if not exists organizer_profiles_verification_idx on public.organizer_profiles(verification_status, trust_level);

create table if not exists public.organization_verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  legal_name text null,
  website text null,
  contact_email text not null,
  contact_phone text null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  review_notes text null,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_verification_request_status_check check (status in ('pending','approved','rejected','needs_more_info','cancelled'))
);

create unique index if not exists organization_verification_one_open_idx
  on public.organization_verification_requests(organization_id)
  where status in ('pending','needs_more_info');
create index if not exists organization_verification_status_idx
  on public.organization_verification_requests(status, created_at desc);

create table if not exists public.organizer_verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organizer_profile_id uuid not null references public.organizer_profiles(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  experience_summary text null,
  social_links jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  requested_trust_level integer not null default 1,
  approved_trust_level integer null,
  review_notes text null,
  reviewed_by_user_id uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizer_verification_request_status_check check (status in ('pending','approved','rejected','needs_more_info','cancelled')),
  constraint organizer_verification_requested_level_check check (requested_trust_level between 1 and 5),
  constraint organizer_verification_approved_level_check check (approved_trust_level is null or approved_trust_level between 0 and 5)
);

create unique index if not exists organizer_verification_one_open_idx
  on public.organizer_verification_requests(organization_id)
  where status in ('pending','needs_more_info');
create index if not exists organizer_verification_status_idx
  on public.organizer_verification_requests(status, created_at desc);

alter table public.organizer_profiles enable row level security;
alter table public.organization_verification_requests enable row level security;
alter table public.organizer_verification_requests enable row level security;

grant select on public.organizer_profiles to authenticated;
grant select on public.organization_verification_requests to authenticated;
grant select on public.organizer_verification_requests to authenticated;

-- Browser reads are membership-scoped; writes are server-only after authorization.
drop policy if exists organizer_profiles_member_or_admin_select on public.organizer_profiles;
create policy organizer_profiles_member_or_admin_select
  on public.organizer_profiles for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organizer_profiles.organization_id
        and om.user_id = (select auth.uid()) and om.status = 'active'
    )
    or exists (
      select 1 from public.admin_users au
      where au.user_id = (select auth.uid()) and au.role in ('superadmin','admin','manager')
    )
  );

drop policy if exists organization_verification_member_or_admin_select on public.organization_verification_requests;
create policy organization_verification_member_or_admin_select
  on public.organization_verification_requests for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organization_verification_requests.organization_id
        and om.user_id = (select auth.uid()) and om.status = 'active'
    )
    or exists (
      select 1 from public.admin_users au
      where au.user_id = (select auth.uid()) and au.role in ('superadmin','admin','manager')
    )
  );

drop policy if exists organizer_verification_member_or_admin_select on public.organizer_verification_requests;
create policy organizer_verification_member_or_admin_select
  on public.organizer_verification_requests for select to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = organizer_verification_requests.organization_id
        and om.user_id = (select auth.uid()) and om.status = 'active'
    )
    or exists (
      select 1 from public.admin_users au
      where au.user_id = (select auth.uid()) and au.role in ('superadmin','admin','manager')
    )
  );

comment on table public.organizer_profiles is 'Organization-scoped public organizer identity and platform publishing trust. Not financial/KYC verification.';
comment on table public.organization_verification_requests is 'Entity verification workflow for an organization. Separate from location claims and payment KYC.';
comment on table public.organizer_verification_requests is 'Organizer publishing-trust review workflow. Separate from organization identity verification and payment KYC.';
