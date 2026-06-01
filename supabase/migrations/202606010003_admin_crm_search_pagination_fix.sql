create extension if not exists pg_trgm;

do $$
declare
  indexed_column text;
  trigram_columns text[] := array[
    'name',
    'restaurant_name',
    'activity_name',
    'phone',
    'email',
    'owner_email',
    'claimed_email',
    'claim_code',
    'city',
    'borough',
    'state',
    'zip_code',
    'location_type',
    'primary_category',
    'cuisine'
  ];
begin
  foreach indexed_column in array trigram_columns loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'locations'
        and column_name = indexed_column
    ) then
      execute format(
        'create index if not exists %I on public.locations using gin ((%I::text) gin_trgm_ops)',
        'locations_' || indexed_column || '_trgm_idx',
        indexed_column
      );
    end if;
  end loop;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'created_at'
  ) then
    execute 'create index if not exists locations_created_at_idx on public.locations (created_at desc)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'locations'
      and column_name = 'updated_at'
  ) then
    execute 'create index if not exists locations_updated_at_idx on public.locations (updated_at desc)';
  end if;
end $$;
