-- Enterprise Team Tools + My Workspace completion layer.
-- Safe/idempotent: no destructive changes, no drops, clock-in/out remains time-only.

create extension if not exists pgcrypto;

alter table public.team_member_profiles add column if not exists can_send_claim_codes boolean default false;
alter table public.team_member_profiles add column if not exists can_send_owner_password_reset boolean default false;

alter table public.locations add column if not exists do_not_contact boolean default false;
alter table public.locations add column if not exists do_not_contact_reason text;
alter table public.locations add column if not exists do_not_contact_at timestamptz;
alter table public.locations add column if not exists do_not_contact_channel text;
alter table public.locations add column if not exists internal_notes text;

create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  assigned_to_user_id uuid,
  assigned_to_team_member_id uuid,
  assigned_by uuid,
  task_type text not null,
  title text not null,
  description text,
  location_id uuid,
  ticket_id uuid,
  source_type text,
  source_id uuid,
  priority text default 'normal',
  status text default 'not_started',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workspace_tasks_assigned_user_status on public.workspace_tasks(assigned_to_user_id, status, due_at);
create index if not exists idx_workspace_tasks_location on public.workspace_tasks(location_id);

create table if not exists public.location_change_requests (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  requested_by_user_id uuid not null,
  requested_by_team_member_id uuid,
  field_name text not null,
  old_value text,
  requested_value text,
  reason text,
  source_type text default 'workspace',
  source_id uuid,
  status text default 'pending_review',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_location_change_requests_status on public.location_change_requests(status, created_at);
create index if not exists idx_location_change_requests_location on public.location_change_requests(location_id);

create table if not exists public.location_claim_codes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  code text not null unique,
  status text default 'generated',
  sent_channel text,
  sent_platform text,
  sent_to_masked text,
  sent_at timestamptz,
  sent_by_user_id uuid,
  sent_by_team_member_id uuid,
  expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_id uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_location_claim_codes_location_status on public.location_claim_codes(location_id, status, created_at);

create table if not exists public.claim_code_audit_logs (
  id uuid primary key default gen_random_uuid(),
  claim_code_id uuid,
  location_id uuid,
  action text not null,
  channel text,
  platform text,
  actor_user_id uuid not null,
  actor_team_member_id uuid,
  target_masked text,
  notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_claim_code_audit_logs_actor on public.claim_code_audit_logs(actor_user_id, created_at);
create index if not exists idx_claim_code_audit_logs_location on public.claim_code_audit_logs(location_id, created_at);

create table if not exists public.password_reset_audit_logs (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid,
  target_email_masked text,
  location_id uuid,
  ticket_id uuid,
  requested_by_user_id uuid not null,
  requested_by_team_member_id uuid,
  reason text,
  status text not null,
  provider_response jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_password_reset_audit_logs_requester on public.password_reset_audit_logs(requested_by_user_id, created_at);
create index if not exists idx_password_reset_audit_logs_target on public.password_reset_audit_logs(target_user_id, created_at);

create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_member_id uuid,
  type text not null,
  title text not null,
  message text,
  href text,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_workspace_notifications_user_read on public.workspace_notifications(user_id, read_at, created_at);

create table if not exists public.workspace_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_team_member_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  location_id uuid,
  ticket_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_workspace_audit_logs_actor on public.workspace_audit_logs(actor_user_id, created_at);
create index if not exists idx_workspace_audit_logs_entity on public.workspace_audit_logs(entity_type, entity_id);

create table if not exists public.workspace_escalations (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid,
  assigned_to_user_id uuid,
  location_id uuid,
  ticket_id uuid,
  source_type text,
  source_id uuid,
  escalation_type text not null,
  priority text default 'normal',
  status text default 'open',
  notes text,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workspace_escalations_status on public.workspace_escalations(status, priority, created_at);

-- Backfill default permissions without overriding manager custom settings.
update public.team_member_profiles set
  can_send_claim_codes = true,
  can_send_owner_password_reset = true
where team_type in ('superadmin','experience_team','support_team','manager')
  and (can_send_claim_codes is distinct from true or can_send_owner_password_reset is distinct from true);
update public.team_member_profiles set can_send_claim_codes = true where team_type = 'ambassador' and can_send_claim_codes is distinct from true;

create or replace function public.can_user_access_workspace_location(p_user_id uuid, p_location_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_profile public.team_member_profiles%rowtype;
  v_is_admin boolean;
begin
  select exists(select 1 from public.admin_users where user_id = p_user_id and role in ('superadmin','admin','manager')) into v_is_admin;
  if v_is_admin then return true; end if;
  select * into v_profile from public.team_member_profiles where user_id = p_user_id and status in ('active','training') limit 1;
  if not found then return false; end if;
  if exists(select 1 from public.locations where id = p_location_id and (created_by_team_member_id = v_profile.id or created_source in ('workspace','ambassador'))) then return true; end if;
  if exists(select 1 from public.ambassador_site_visits where user_id = p_user_id and location_id = p_location_id) then return true; end if;
  if exists(select 1 from public.ambassador_social_outreach where user_id = p_user_id and location_id = p_location_id) then return true; end if;
  if exists(select 1 from public.team_follow_ups where user_id = p_user_id and location_id = p_location_id) then return true; end if;
  if exists(select 1 from public.workspace_tasks where assigned_to_user_id = p_user_id and location_id = p_location_id) then return true; end if;
  return false;
end;
$$;

alter table public.workspace_tasks enable row level security;
alter table public.location_change_requests enable row level security;
alter table public.location_claim_codes enable row level security;
alter table public.claim_code_audit_logs enable row level security;
alter table public.password_reset_audit_logs enable row level security;
alter table public.workspace_notifications enable row level security;
alter table public.workspace_audit_logs enable row level security;
alter table public.workspace_escalations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workspace_tasks' and policyname='workspace_tasks_own_or_admin') then
    create policy workspace_tasks_own_or_admin on public.workspace_tasks for all using (assigned_to_user_id = auth.uid() or exists(select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','manager'))) with check (assigned_to_user_id = auth.uid() or exists(select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','manager')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workspace_notifications' and policyname='workspace_notifications_own_or_admin') then
    create policy workspace_notifications_own_or_admin on public.workspace_notifications for all using (user_id = auth.uid() or exists(select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','manager'))) with check (user_id = auth.uid() or exists(select 1 from public.admin_users where user_id = auth.uid() and role in ('superadmin','admin','manager')));
  end if;
end $$;
