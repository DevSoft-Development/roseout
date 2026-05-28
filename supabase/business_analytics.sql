-- Business analytics foundation for TheOutHaven location owners and admins.
-- Safe to run more than once: tables are created if missing and columns are added if tables already exist.

create table if not exists public.location_analytics_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  event_type text not null,
  event_source text default 'web',

  session_id text,
  search_query text,
  outing_type text,
  referrer text,

  metadata jsonb default '{}'::jsonb,

  created_at timestamptz default now(),

  constraint location_analytics_events_event_type_check check (
    event_type in (
      'profile_view',
      'search_appearance',
      'search_click',
      'reservation_started',
      'reservation_completed',
      'reservation_cancelled',
      'directions_click',
      'website_click',
      'phone_click',
      'share_click'
    )
  )
);

alter table if exists public.location_analytics_events
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists event_source text default 'web',
  add column if not exists session_id text,
  add column if not exists search_query text,
  add column if not exists outing_type text,
  add column if not exists referrer text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists location_analytics_events_location_id_idx on public.location_analytics_events(location_id);
create index if not exists location_analytics_events_event_type_idx on public.location_analytics_events(event_type);
create index if not exists location_analytics_events_created_at_idx on public.location_analytics_events(created_at);
create index if not exists location_analytics_events_user_id_idx on public.location_analytics_events(user_id);
create index if not exists location_analytics_events_session_id_idx on public.location_analytics_events(session_id);

create table if not exists public.location_daily_analytics (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  analytics_date date not null,

  profile_views integer default 0,
  search_appearances integer default 0,
  search_clicks integer default 0,
  directions_clicks integer default 0,
  website_clicks integer default 0,
  phone_clicks integer default 0,
  share_clicks integer default 0,

  reservation_starts integer default 0,
  reservation_completions integer default 0,
  reservation_cancellations integer default 0,

  total_revenue numeric default 0,
  average_booking_value numeric default 0,

  unique_visitors integer default 0,
  repeat_visitors integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(location_id, analytics_date)
);

alter table if exists public.location_daily_analytics
  add column if not exists analytics_date date not null default current_date,
  add column if not exists profile_views integer default 0,
  add column if not exists search_appearances integer default 0,
  add column if not exists search_clicks integer default 0,
  add column if not exists directions_clicks integer default 0,
  add column if not exists website_clicks integer default 0,
  add column if not exists phone_clicks integer default 0,
  add column if not exists share_clicks integer default 0,
  add column if not exists reservation_starts integer default 0,
  add column if not exists reservation_completions integer default 0,
  add column if not exists reservation_cancellations integer default 0,
  add column if not exists total_revenue numeric default 0,
  add column if not exists average_booking_value numeric default 0,
  add column if not exists unique_visitors integer default 0,
  add column if not exists repeat_visitors integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists location_daily_analytics_location_id_idx on public.location_daily_analytics(location_id);
create index if not exists location_daily_analytics_date_idx on public.location_daily_analytics(analytics_date);

create table if not exists public.location_hourly_analytics (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  day_of_week integer not null,
  hour_of_day integer not null,

  profile_views integer default 0,
  search_clicks integer default 0,
  reservations integer default 0,
  cancellations integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(location_id, day_of_week, hour_of_day),
  constraint location_hourly_analytics_day_check check (day_of_week between 0 and 6),
  constraint location_hourly_analytics_hour_check check (hour_of_day between 0 and 23)
);

alter table if exists public.location_hourly_analytics
  add column if not exists profile_views integer default 0,
  add column if not exists search_clicks integer default 0,
  add column if not exists reservations integer default 0,
  add column if not exists cancellations integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists location_hourly_analytics_location_id_idx on public.location_hourly_analytics(location_id);
create index if not exists location_hourly_analytics_day_hour_idx on public.location_hourly_analytics(day_of_week, hour_of_day);

create table if not exists public.location_customer_insights (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  visit_count integer default 1,
  reservation_count integer default 0,
  cancelled_count integer default 0,

  preferred_outing_type text,
  preferred_party_size integer,
  last_seen_at timestamptz,
  first_seen_at timestamptz default now(),

  metadata jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(location_id, user_id)
);

alter table if exists public.location_customer_insights
  add column if not exists visit_count integer default 1,
  add column if not exists reservation_count integer default 0,
  add column if not exists cancelled_count integer default 0,
  add column if not exists preferred_outing_type text,
  add column if not exists preferred_party_size integer,
  add column if not exists last_seen_at timestamptz,
  add column if not exists first_seen_at timestamptz default now(),
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists location_customer_insights_location_id_idx on public.location_customer_insights(location_id);
create index if not exists location_customer_insights_user_id_idx on public.location_customer_insights(user_id);

alter table public.location_analytics_events enable row level security;
alter table public.location_daily_analytics enable row level security;
alter table public.location_hourly_analytics enable row level security;
alter table public.location_customer_insights enable row level security;

create or replace function public.is_location_analytics_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

create or replace function public.can_view_location_analytics(location_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_location_analytics_admin()
    or exists (
      select 1
      from public.locations l
      where l.id = location_uuid
        and (
          l.owner_user_id = auth.uid()
          or lower(coalesce(l.claimed_by_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or lower(coalesce(l.owner_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    );
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_analytics_events'
      and policyname = 'Admins can view analytics events'
  ) then
    create policy "Admins can view analytics events"
      on public.location_analytics_events for select
      using (public.is_location_analytics_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_analytics_events'
      and policyname = 'Owners can view own analytics events'
  ) then
    create policy "Owners can view own analytics events"
      on public.location_analytics_events for select
      using (public.can_view_location_analytics(location_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_daily_analytics'
      and policyname = 'Admins can view daily analytics'
  ) then
    create policy "Admins can view daily analytics"
      on public.location_daily_analytics for select
      using (public.is_location_analytics_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_daily_analytics'
      and policyname = 'Owners can view own daily analytics'
  ) then
    create policy "Owners can view own daily analytics"
      on public.location_daily_analytics for select
      using (public.can_view_location_analytics(location_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_hourly_analytics'
      and policyname = 'Admins can view hourly analytics'
  ) then
    create policy "Admins can view hourly analytics"
      on public.location_hourly_analytics for select
      using (public.is_location_analytics_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_hourly_analytics'
      and policyname = 'Owners can view own hourly analytics'
  ) then
    create policy "Owners can view own hourly analytics"
      on public.location_hourly_analytics for select
      using (public.can_view_location_analytics(location_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_customer_insights'
      and policyname = 'Admins can view customer insights'
  ) then
    create policy "Admins can view customer insights"
      on public.location_customer_insights for select
      using (public.is_location_analytics_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_customer_insights'
      and policyname = 'Owners can view own customer insights'
  ) then
    create policy "Owners can view own customer insights"
      on public.location_customer_insights for select
      using (public.can_view_location_analytics(location_id));
  end if;
end $$;

-- No public/client insert policy is intentionally defined. Event ingestion happens through server routes with the service role.
