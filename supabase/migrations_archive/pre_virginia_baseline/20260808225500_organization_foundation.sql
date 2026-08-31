-- TheOutHaven Organization Foundation
-- Additive only: introduces organization identity and relationships without cutting over
-- existing location claims, owner mappings, team access, billing, reservations, or login routing.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text null,
  organization_type text not null default 'business',
  status text not null default 'active',
  verification_status text not null default 'unverified',
  trust_level integer not null default 0,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(trim(name)) > 0),
  constraint organizations_type_check check (organization_type in ('business','restaurant_group','venue','promoter','nonprofit','church','community','museum','creator','individual_organizer','other')),
  constraint organizations_status_check check (status in ('active','inactive','suspended','archived')),
  constraint organizations_verification_check check (verification_status in ('unverified','pending','verified','rejected','suspended')),
  constraint organizations_trust_level_check check (trust_level between 0 and 5)
);

create index if not exists organizations_created_by_idx on public.organizations(created_by_user_id);
create index if not exists organizations_status_idx on public.organizations(status);
create index if not exists organizations_verification_idx on public.organizations(verification_status);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  email text null,
  display_name text null,
  role text not null default 'member',
  status text not null default 'active',
  invited_by_user_id uuid null references auth.users(id) on delete set null,
  invited_at timestamptz null,
  accepted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_role_check check (role in ('owner','admin','manager','member','view_only')),
  constraint organization_members_status_check check (status in ('invited','active','suspended','removed')),
  constraint organization_members_identity_check check (user_id is not null or email is not null)
);

create unique index if not exists organization_members_org_user_uidx
  on public.organization_members(organization_id, user_id)
  where user_id is not null;
create unique index if not exists organization_members_org_email_uidx
  on public.organization_members(organization_id, lower(email))
  where email is not null;
create index if not exists organization_members_user_status_idx
  on public.organization_members(user_id, status);
create index if not exists organization_members_org_status_idx
  on public.organization_members(organization_id, status);

create table if not exists public.organization_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  relationship_type text not null default 'owned',
  status text not null default 'active',
  linked_by_user_id uuid null references auth.users(id) on delete set null,
  source_type text null,
  source_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_locations_relationship_check check (relationship_type in ('owned','operated','managed','venue','partner')),
  constraint organization_locations_status_check check (status in ('active','inactive','removed')),
  unique (organization_id, location_id)
);

create index if not exists organization_locations_location_idx
  on public.organization_locations(location_id, status);
create index if not exists organization_locations_org_idx
  on public.organization_locations(organization_id, status);

create table if not exists public.organization_migration_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_table text not null,
  source_record_id text not null,
  target_entity_type text not null,
  target_entity_id text not null,
  strategy text not null,
  confidence text not null default 'high',
  migration_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organization_migration_confidence_check check (confidence in ('high','medium','review')),
  unique (source_table, source_record_id, target_entity_type, target_entity_id, migration_version)
);

create index if not exists organization_migration_links_org_idx
  on public.organization_migration_links(organization_id, created_at);
create index if not exists organization_migration_links_source_idx
  on public.organization_migration_links(source_table, source_record_id);

create table if not exists public.organization_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  old_value jsonb null,
  new_value jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organization_audit_action_not_blank check (length(trim(action)) > 0),
  constraint organization_audit_entity_not_blank check (length(trim(entity_type)) > 0)
);

create index if not exists organization_audit_logs_org_idx
  on public.organization_audit_logs(organization_id, created_at desc);
create index if not exists organization_audit_logs_actor_idx
  on public.organization_audit_logs(actor_user_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_locations enable row level security;
alter table public.organization_migration_links enable row level security;
alter table public.organization_audit_logs enable row level security;

-- Browser access is deliberately read-only in this foundation phase.
-- Mutations are performed by authenticated server-only helpers after explicit authorization.
grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.organization_locations to authenticated;
grant select on public.organization_audit_logs to authenticated;
revoke all on public.organization_migration_links from anon, authenticated;

-- Organization records are visible to active members and privileged internal admins.
drop policy if exists organizations_member_or_admin_select on public.organizations;
create policy organizations_member_or_admin_select
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = organizations.id
        and om.user_id = (select auth.uid())
        and om.status = 'active'
    )
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.role in ('superadmin','admin','manager')
    )
  );

-- Members can always read their own membership rows. Internal admins can inspect all.
-- Other team members are returned by trusted server helpers only in this phase.
drop policy if exists organization_members_own_or_admin_select on public.organization_members;
create policy organization_members_own_or_admin_select
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.role in ('superadmin','admin','manager')
    )
  );

-- Organization locations are visible only when the current user has an active membership.
drop policy if exists organization_locations_member_or_admin_select on public.organization_locations;
create policy organization_locations_member_or_admin_select
  on public.organization_locations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = organization_locations.organization_id
        and om.user_id = (select auth.uid())
        and om.status = 'active'
    )
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.role in ('superadmin','admin','manager')
    )
  );

-- Audit history is readable by active organization members and privileged internal admins.
drop policy if exists organization_audit_logs_member_or_admin_select on public.organization_audit_logs;
create policy organization_audit_logs_member_or_admin_select
  on public.organization_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members om
      where om.organization_id = organization_audit_logs.organization_id
        and om.user_id = (select auth.uid())
        and om.status = 'active'
    )
    or exists (
      select 1
      from public.admin_users au
      where au.user_id = (select auth.uid())
        and au.role in ('superadmin','admin','manager')
    )
  );

comment on table public.organizations is 'Canonical business/entity container for business owners, venues, promoters, nonprofits, creators, and future event organizers.';
comment on table public.organization_members is 'Business-facing membership. Separate from TheOutHaven internal team_member_profiles and team_location_assignments.';
comment on table public.organization_locations is 'Organization-to-location relationship. Existing location owner and claim mappings remain operational during transition.';
comment on table public.organization_migration_links is 'Server-only evidence linking legacy ownership/claim records to organization foundation records for safe, auditable backfills.';
comment on table public.organization_audit_logs is 'Append-only audit history for organization-domain mutations.';
