create extension if not exists pgcrypto;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null,
  actor_email text null,
  actor_role text null,
  target_user_id uuid null,
  target_email text null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  summary text null,
  before_data jsonb null,
  after_data jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_at_desc_idx on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_actor_created_idx on public.admin_audit_logs (actor_user_id, created_at desc);
create index if not exists admin_audit_logs_target_created_idx on public.admin_audit_logs (target_user_id, created_at desc);
create index if not exists admin_audit_logs_action_created_idx on public.admin_audit_logs (action, created_at desc);
create index if not exists admin_audit_logs_entity_idx on public.admin_audit_logs (entity_type, entity_id);

alter table if exists public.user_profiles add column if not exists deleted_at timestamptz;
alter table if exists public.user_profiles add column if not exists deleted_by uuid;
alter table if exists public.user_profiles add column if not exists disabled_at timestamptz;
alter table if exists public.user_profiles add column if not exists disabled_by uuid;
alter table if exists public.user_profiles add column if not exists account_status text not null default 'active';
alter table if exists public.users add column if not exists deleted_at timestamptz;
alter table if exists public.users add column if not exists deleted_by uuid;
alter table if exists public.users add column if not exists disabled_at timestamptz;
alter table if exists public.users add column if not exists disabled_by uuid;
alter table if exists public.users add column if not exists account_status text not null default 'active';
create index if not exists user_profiles_account_status_idx on public.user_profiles (account_status);

alter table if exists public.launch_waitlist_signups add column if not exists beta_interest boolean not null default true;
alter table if exists public.launch_waitlist_signups add column if not exists tester_type text;
alter table if exists public.launch_waitlist_signups add column if not exists beta_application_status text;
alter table if exists public.launch_waitlist_signups add column if not exists beta_application_id uuid;
alter table if exists public.launch_waitlist_signups add column if not exists beta_approved_at timestamptz;
alter table if exists public.launch_waitlist_signups add column if not exists beta_approved_by uuid;
alter table if exists public.launch_waitlist_signups add column if not exists prize_rules_confirmed boolean not null default false;
alter table if exists public.launch_waitlist_signups add column if not exists age_18_confirmed boolean not null default false;
alter table if exists public.launch_waitlist_signups add column if not exists followed_social_verified_at timestamptz;
alter table if exists public.launch_waitlist_signups add column if not exists followed_social_verified_by uuid;
alter table if exists public.launch_waitlist_signups add column if not exists tagged_friends_verified_at timestamptz;
alter table if exists public.launch_waitlist_signups add column if not exists tagged_friends_verified_by uuid;
create index if not exists launch_waitlist_beta_interest_idx on public.launch_waitlist_signups (beta_interest, created_at desc);
create index if not exists launch_waitlist_beta_status_idx on public.launch_waitlist_signups (beta_application_status, created_at desc);

do $$
declare constraint_name text;
begin
  if to_regclass('public.admin_users') is not null then
    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'public.admin_users'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%role%'
    loop
      execute format('alter table public.admin_users drop constraint if exists %I', constraint_name);
    end loop;
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('superadmin','admin','manager','editor','ambassador','experience','partner_ambassador','experience_team','viewer','disabled'));
  end if;
end $$;
