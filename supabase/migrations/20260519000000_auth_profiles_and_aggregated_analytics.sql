create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  mobile_number text,
  city text,
  state text,
  age_range text,
  gender text,
  relationship_status text,
  favorite_cuisines text[],
  favorite_activities text[],
  budget_range text,
  preferred_area text,
  outing_style text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  location_id uuid,
  location_type text,
  city text,
  state text,
  age_range text,
  budget_range text,
  outing_style text,
  search_query text,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_view_events (like public.search_events including all);
create table if not exists public.reservation_interest_events (like public.search_events including all);
