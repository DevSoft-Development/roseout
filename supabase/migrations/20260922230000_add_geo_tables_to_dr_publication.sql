-- Keep new writable geography tables inside the Virginia -> Oregon DR publication.

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'theouthaven_dr_publication'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'theouthaven_dr_publication'
        and schemaname = 'public'
        and tablename = 'geo_postal_areas'
    ) then
      execute 'alter publication theouthaven_dr_publication add table public.geo_postal_areas';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'theouthaven_dr_publication'
        and schemaname = 'public'
        and tablename = 'crm_location_primary_territories'
    ) then
      execute 'alter publication theouthaven_dr_publication add table public.crm_location_primary_territories';
    end if;
  end if;
end;
$$;
