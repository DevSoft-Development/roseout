create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text,
  description text,
  audience text not null default 'users' check (audience in ('users','locations','both')),
  promo_type text not null default 'premium_access' check (promo_type in ('premium_access','search_boost','location_pro_trial','discount')),
  plan_granted text,
  duration_days integer,
  search_limit_override integer,
  discount_percent numeric,
  discount_amount numeric,
  max_redemptions integer,
  redemption_count integer not null default 0,
  max_redemptions_per_user integer not null default 1,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid references public.promo_codes(id) on delete cascade,
  code text not null,
  user_id uuid references auth.users(id) on delete cascade,
  location_id text,
  location_type text,
  audience text,
  granted_plan text,
  premium_until timestamptz,
  search_limit_override integer,
  discount_percent numeric,
  discount_amount numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists promo_codes_code_idx on public.promo_codes(code);
create index if not exists promo_codes_audience_idx on public.promo_codes(audience);
create index if not exists promo_codes_active_idx on public.promo_codes(is_active);
create index if not exists promo_redemptions_user_id_idx on public.promo_code_redemptions(user_id);
create index if not exists promo_redemptions_location_idx on public.promo_code_redemptions(location_id, location_type);
create index if not exists promo_redemptions_code_idx on public.promo_code_redemptions(code);

alter table public.user_profiles add column if not exists promo_code_used text;
alter table public.user_profiles add column if not exists weekly_search_limit integer default 3;

alter table public.restaurants add column if not exists plan text;
alter table public.restaurants add column if not exists plan_status text;
alter table public.restaurants add column if not exists pro_until timestamptz;
alter table public.restaurants add column if not exists promo_code_used text;

alter table public.activities add column if not exists plan text;
alter table public.activities add column if not exists plan_status text;
alter table public.activities add column if not exists pro_until timestamptz;
alter table public.activities add column if not exists promo_code_used text;
