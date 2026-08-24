-- Pin search_path on internal import/deduplication maintenance helpers when present.
-- These routines are already restricted to postgres/service_role (plus Supabase internal admin).
-- Guards keep clean environments safe when an out-of-band helper is absent from tracked history.

do $$
begin
  if to_regprocedure('public.oh_merge_live_location_duplicate(uuid,uuid,text)') is not null then
    execute 'alter function public.oh_merge_live_location_duplicate(uuid,uuid,text) set search_path = public';
  end if;

  if to_regprocedure('public.oh_ignore_live_location_duplicate(uuid,uuid,text,text)') is not null then
    execute 'alter function public.oh_ignore_live_location_duplicate(uuid,uuid,text,text) set search_path = public';
  end if;

  if to_regprocedure('public.oh_find_staging_duplicates(uuid)') is not null then
    execute 'alter function public.oh_find_staging_duplicates(uuid) set search_path = public';
  end if;

  if to_regprocedure('public.oh_publish_ready_staged_locations(integer)') is not null then
    execute 'alter function public.oh_publish_ready_staged_locations(integer) set search_path = public';
  end if;

  if to_regprocedure('public.oh_cleanup_low_level_locations()') is not null then
    execute 'alter function public.oh_cleanup_low_level_locations() set search_path = public';
  end if;

  if to_regprocedure('public.oh_publish_import_batch(uuid,integer)') is not null then
    execute 'alter function public.oh_publish_import_batch(uuid,integer) set search_path = public';
  end if;
end
$$;
