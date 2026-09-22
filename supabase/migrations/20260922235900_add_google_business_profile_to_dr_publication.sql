-- Keep the Oregon DR logical-replication publication complete for Google Business Profile tables.
do $dr$
begin
  if exists (select 1 from pg_publication where pubname = 'theouthaven_dr_publication') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'theouthaven_dr_publication'
        and schemaname = 'public'
        and tablename = 'google_business_profile_connections'
    ) then
      execute 'alter publication theouthaven_dr_publication add table public.google_business_profile_connections';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'theouthaven_dr_publication'
        and schemaname = 'public'
        and tablename = 'google_business_profile_connection_secrets'
    ) then
      execute 'alter publication theouthaven_dr_publication add table public.google_business_profile_connection_secrets';
    end if;
  end if;
end
$dr$;
