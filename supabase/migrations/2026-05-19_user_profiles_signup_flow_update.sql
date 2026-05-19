create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  mobile_number text,
  city text,
  state text,
  age_range text,
  gender text,
  relationship_status text,
  favorite_cuisines text[] default '{}',
  favorite_activities text[] default '{}',
  budget_range text,
  preferred_area text,
  outing_style text,
  account_type text default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.user_profiles add column if not exists id uuid;
alter table if exists public.user_profiles add column if not exists full_name text;
alter table if exists public.user_profiles add column if not exists mobile_number text;
alter table if exists public.user_profiles add column if not exists city text;
alter table if exists public.user_profiles add column if not exists state text;
alter table if exists public.user_profiles add column if not exists age_range text;
alter table if exists public.user_profiles add column if not exists gender text;
alter table if exists public.user_profiles add column if not exists relationship_status text;
alter table if exists public.user_profiles add column if not exists favorite_cuisines text[] default '{}';
alter table if exists public.user_profiles add column if not exists favorite_activities text[] default '{}';
alter table if exists public.user_profiles add column if not exists budget_range text;
alter table if exists public.user_profiles add column if not exists preferred_area text;
alter table if exists public.user_profiles add column if not exists outing_style text;
alter table if exists public.user_profiles add column if not exists account_type text default 'user';
alter table if exists public.user_profiles add column if not exists created_at timestamptz default now();
alter table if exists public.user_profiles add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'user_id'
  ) then
    update public.user_profiles set id = user_id where id is null;
  end if;
end $$;

alter table if exists public.user_profiles
  alter column favorite_cuisines set default '{}',
  alter column favorite_activities set default '{}',
  alter column account_type set default 'user',
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.user_profiles drop constraint if exists user_profiles_pkey;
alter table if exists public.user_profiles add constraint user_profiles_pkey primary key (id);

alter table if exists public.user_profiles drop constraint if exists user_profiles_user_id_fkey;
alter table if exists public.user_profiles
  add constraint user_profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
