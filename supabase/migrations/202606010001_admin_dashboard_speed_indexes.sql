create index if not exists idx_locations_admin_crm_updated_at
on public.locations (updated_at desc);

create index if not exists idx_locations_admin_crm_created_at
on public.locations (created_at desc);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'owner_user_id'
  ) then
    create index if not exists idx_locations_admin_owner_user_id
    on public.locations (owner_user_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'is_claimed'
  ) then
    create index if not exists idx_locations_admin_is_claimed
    on public.locations (is_claimed);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'is_searchable'
  ) then
    create index if not exists idx_locations_admin_is_searchable
    on public.locations (is_searchable);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'active'
  ) then
    create index if not exists idx_locations_admin_active
    on public.locations (active);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'upgrade_score'
  ) then
    create index if not exists idx_locations_admin_upgrade_score
    on public.locations (upgrade_score desc);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'opportunity_score'
  ) then
    create index if not exists idx_locations_admin_opportunity_score
    on public.locations (opportunity_score desc);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'churn_risk_score'
  ) then
    create index if not exists idx_locations_admin_churn_risk_score
    on public.locations (churn_risk_score desc);
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
    create index if not exists idx_locations_admin_owner_email_lower
    on public.locations (lower(owner_email));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'city'
  ) then
    create index if not exists idx_locations_admin_city_lower
    on public.locations (lower(city));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'borough'
  ) then
    create index if not exists idx_locations_admin_borough_lower
    on public.locations (lower(borough));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'name'
  ) then
    create index if not exists idx_locations_admin_name_lower
    on public.locations (lower(name));
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
      and column_name = 'role'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'created_at'
  ) then
    create index if not exists idx_users_owner_role_created_at
    on public.users (role, created_at desc);
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
    create index if not exists idx_users_owner_email_lower
    on public.users (lower(email));
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
    create index if not exists idx_users_owner_full_name_lower
    on public.users (lower(full_name));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'location_reservations'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'location_reservations'
      and column_name = 'reservation_date'
  ) then
    create index if not exists idx_location_reservations_reservation_date
    on public.location_reservations (reservation_date);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'support_tickets'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_tickets'
      and column_name = 'status'
  ) then
    create index if not exists idx_support_tickets_status
    on public.support_tickets (status);
  end if;
end $$;
