-- Pin search_path for remaining import helpers while resolving extension schemas dynamically.
-- This avoids assuming pg_trgm/unaccent are installed in public in every environment.

do $$
declare
  v_unaccent_schema text;
  v_pg_trgm_schema text;
begin
  select n.nspname
    into v_unaccent_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'unaccent';

  select n.nspname
    into v_pg_trgm_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if to_regprocedure('public.oh_normalize_text(text)') is not null then
    if v_unaccent_schema is null or v_unaccent_schema = 'public' then
      execute 'alter function public.oh_normalize_text(text) set search_path = public, pg_temp';
    else
      execute format(
        'alter function public.oh_normalize_text(text) set search_path = public, %I, pg_temp',
        v_unaccent_schema
      );
    end if;
  end if;

  if to_regprocedure('public.oh_location_key(text,text,text,text)') is not null then
    execute 'alter function public.oh_location_key(text,text,text,text) set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.oh_refresh_staging_quality(uuid)') is not null then
    execute 'alter function public.oh_refresh_staging_quality(uuid) set search_path = public, pg_temp';
  end if;

  if to_regprocedure('public.oh_find_staging_duplicates(uuid)') is not null then
    if v_pg_trgm_schema is null or v_pg_trgm_schema = 'public' then
      execute 'alter function public.oh_find_staging_duplicates(uuid) set search_path = public, pg_temp';
    else
      execute format(
        'alter function public.oh_find_staging_duplicates(uuid) set search_path = public, %I, pg_temp',
        v_pg_trgm_schema
      );
    end if;
  end if;
end
$$;
