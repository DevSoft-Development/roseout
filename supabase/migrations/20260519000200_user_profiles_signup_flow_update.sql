create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  mobile_number text,
  city text,
  state text,
  age_range text,
  favorite_cuisines text[] default '{}',
  favorite_activities text[] default '{}',
  budget_range text,
  preferred_area text,
  outing_style text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.user_profiles add column if not exists id uuid;
alter table if exists public.user_profiles add column if not exists full_name text;
alter table if exists public.user_profiles add column if not exists mobile_number text;
alter table if exists public.user_profiles add column if not exists city text;
alter table if exists public.user_profiles add column if not exists state text;
alter table if exists public.user_profiles add column if not exists age_range text;
alter table if exists public.user_profiles add column if not exists favorite_cuisines text[] default '{}';
alter table if exists public.user_profiles add column if not exists favorite_activities text[] default '{}';
alter table if exists public.user_profiles add column if not exists budget_range text;
alter table if exists public.user_profiles add column if not exists preferred_area text;
alter table if exists public.user_profiles add column if not exists outing_style text;
alter table if exists public.user_profiles add column if not exists created_at timestamptz default now();
alter table if exists public.user_profiles add column if not exists updated_at timestamptz default now();
