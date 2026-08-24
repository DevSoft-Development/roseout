-- Restrict the internal search-profile diagnostics RPC to trusted server roles.
-- The customer-facing profile search RPC remains unchanged.
-- Guard the migration for clean environments where this live helper may be absent.

do $$
begin
  if to_regprocedure('public.enterprise_search_profile_location_diagnostics(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer)') is not null then
    execute 'revoke execute on function public.enterprise_search_profile_location_diagnostics(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) from public, anon, authenticated';
    execute 'grant execute on function public.enterprise_search_profile_location_diagnostics(text,text,text[],text,text,text,text,text,text,double precision,double precision,double precision,integer) to postgres, service_role';
  end if;
end
$$;
