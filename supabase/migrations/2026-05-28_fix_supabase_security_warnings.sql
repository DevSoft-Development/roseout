-- Fix Supabase security warnings for metadata-based RLS and SECURITY DEFINER view access.
-- This migration replaces editable auth metadata admin checks with a database-backed
-- admin role table and makes business_crm_snapshot run with invoker privileges.

begin;

-- -----------------------------------------------------------------------------
-- Secure database-backed admin roles
-- -----------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint admin_users_role_check check (role in ('admin', 'superadmin'))
);

-- If admin_users already existed without the new columns, make the migration additive.
alter table public.admin_users
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists role text not null default 'admin',
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_users'::regclass
      and conname = 'admin_users_role_check'
  ) then
    alter table public.admin_users
      add constraint admin_users_role_check check (role in ('admin', 'superadmin'));
  end if;
end $$;

alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.role = 'superadmin'
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_superadmin() to authenticated;

drop policy if exists "Superadmins can read admin users" on public.admin_users;
create policy "Superadmins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_superadmin());

drop policy if exists "Superadmins can manage admin users" on public.admin_users;
create policy "Superadmins can manage admin users"
on public.admin_users
for all
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- -----------------------------------------------------------------------------
-- Restaurants admin policy: replace editable auth metadata authorization.
-- -----------------------------------------------------------------------------
drop policy if exists "Admins full access to restaurants" on public.restaurants;

create policy "Admins full access to restaurants"
on public.restaurants
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Location analytics helpers: remove editable auth metadata fallback from admin checks.
-- -----------------------------------------------------------------------------
create or replace function public.is_location_analytics_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

-- -----------------------------------------------------------------------------
-- business_crm_snapshot: keep business logic/columns but use invoker privileges.
-- -----------------------------------------------------------------------------
create or replace view public.business_crm_snapshot
with (security_invoker = true)
as
select
  l.id,
  l.name,
  l.city,
  l.state,
  l.is_claimed,
  l.reservation_url,
  coalesce(l.crm_status, 'Unclaimed') as crm_status,
  coalesce(l.opportunity_score, 0) as opportunity_score,
  coalesce(l.upgrade_probability, 0) as upgrade_probability,
  coalesce(l.engagement_score, 0) as engagement_score,
  coalesce(l.traffic_score, 0) as traffic_score,
  coalesce(l.conversion_score, 0) as conversion_score,
  coalesce(l.retention_score, 0) as retention_score,
  coalesce(l.churn_risk_score, 0) as churn_risk_score,
  greatest(0, least(100,
    coalesce(l.traffic_score, 0) * 0.35 +
    coalesce(l.engagement_score, 0) * 0.2 +
    coalesce(l.conversion_score, 0) * 0.25 +
    coalesce(l.retention_score, 0) * 0.2
  )) as trending_score,
  coalesce(analytics.reservation_completions_30d, 0) as reservation_completions_30d,
  coalesce(analytics.profile_views_30d, 0) as profile_views_30d,
  coalesce(analytics.search_appearances_30d, 0) as search_appearances_30d,
  coalesce(analytics.saves_30d, 0) as saves_30d,
  coalesce(analytics.conversion_rate_30d, 0) as conversion_rate_30d
from public.locations l
left join (
  select
    lda.location_id,
    sum(lda.profile_views) as profile_views_30d,
    sum(lda.search_appearances) as search_appearances_30d,
    sum(lda.share_clicks) as saves_30d,
    sum(lda.reservation_completions) as reservation_completions_30d,
    case when sum(lda.profile_views) > 0
      then sum(lda.reservation_completions)::numeric / sum(lda.profile_views)::numeric
      else 0 end as conversion_rate_30d
  from public.location_daily_analytics lda
  where lda.analytics_date >= (current_date - interval '30 days')
  group by lda.location_id
) analytics on analytics.location_id = l.id;

revoke all on public.business_crm_snapshot from anon;
revoke all on public.business_crm_snapshot from authenticated;

-- The app currently queries this view directly from authenticated admin dashboard
-- surfaces. The view is security_invoker, so underlying table privileges and RLS are
-- evaluated as the caller instead of being bypassed by the view owner.
grant select on public.business_crm_snapshot to authenticated;

-- Optional secure RPC for admin-only business CRM access without granting anon access.
create or replace function public.get_business_crm_snapshot()
returns setof public.business_crm_snapshot
language sql
stable
security invoker
set search_path = public
as $$
  select s.*
  from public.business_crm_snapshot s
  where public.is_admin();
$$;

grant execute on function public.get_business_crm_snapshot() to authenticated;

-- -----------------------------------------------------------------------------
-- First superadmin seed example. Run manually in the Supabase SQL editor.
-- -----------------------------------------------------------------------------
-- Replace this email with the real owner/admin email and run manually in Supabase SQL editor.
-- insert into public.admin_users (user_id, role)
-- select id, 'superadmin'
-- from auth.users
-- where email = 'OWNER_EMAIL_HERE'
-- on conflict (user_id) do update set role = 'superadmin';

commit;

-- -----------------------------------------------------------------------------
-- Verification queries to run after applying this migration.
-- -----------------------------------------------------------------------------
-- Confirm no restaurants policies use user_metadata:
-- select schemaname, tablename, policyname, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename = 'restaurants';
--
-- Search all public policies for unsafe metadata references. Expected result: 0 rows.
-- select schemaname, tablename, policyname, qual, with_check
-- from pg_policies
-- where qual::text ilike '%user_metadata%'
--    or with_check::text ilike '%user_metadata%'
--    or qual::text ilike '%raw_user_meta_data%'
--    or with_check::text ilike '%raw_user_meta_data%';
--
-- Confirm business_crm_snapshot is security_invoker. Expected reloptions include security_invoker=true.
-- select
--   n.nspname as schema_name,
--   c.relname as view_name,
--   c.reloptions
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname = 'business_crm_snapshot';
