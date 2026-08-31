create extension if not exists pg_trgm;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'name'
  ) then
    create index if not exists idx_locations_admin_name_trgm
    on public.locations using gin (name gin_trgm_ops);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'restaurant_name'
  ) then
    create index if not exists idx_locations_admin_restaurant_name_trgm
    on public.locations using gin (restaurant_name gin_trgm_ops);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'activity_name'
  ) then
    create index if not exists idx_locations_admin_activity_name_trgm
    on public.locations using gin (activity_name gin_trgm_ops);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'owner_email'
  ) then
    create index if not exists idx_locations_admin_owner_email_trgm
    on public.locations using gin (owner_email gin_trgm_ops);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'email'
  ) then
    create index if not exists idx_users_email_trgm
    on public.users using gin (email gin_trgm_ops);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'full_name'
  ) then
    create index if not exists idx_users_full_name_trgm
    on public.users using gin (full_name gin_trgm_ops);
  end if;
end $$;
