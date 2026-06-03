-- Admin Location Support Mode
-- Safe to run multiple times. Does not expose secrets or alter existing reservation data.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.admin_location_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  admin_role text,
  location_id uuid not null,
  action_type text not null,
  target_type text,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists admin_location_action_logs_location_created_idx
  on public.admin_location_action_logs (location_id, created_at desc);

create index if not exists admin_location_action_logs_admin_created_idx
  on public.admin_location_action_logs (admin_user_id, created_at desc);

create index if not exists admin_location_action_logs_action_created_idx
  on public.admin_location_action_logs (action_type, created_at desc);

-- Compact, safe search view for admin support mode. Only include public/support-safe fields.
do $$
begin
  if to_regclass('public.locations') is not null then
    execute $view$
      create or replace view public.admin_location_search_view as
      select
        id,
        name,
        restaurant_name,
        activity_name,
        business_name,
        address,
        city,
        state,
        coalesce(zip_code, zip) as zip_code,
        phone,
        email,
        owner_email,
        location_type,
        primary_category,
        source_table,
        plan,
        subscription_plan,
        billing_plan,
        reserve_plan,
        reservation_plan,
        reservation_enabled,
        internal_reservations_enabled,
        uses_internal_reservations
      from public.locations
    $view$;
  end if;
exception
  when undefined_column then
    -- Some deployments have older location schemas. The TypeScript API route
    -- falls back to direct guarded searches when this compatibility view cannot
    -- be created with every optional column.
    null;
end $$;
