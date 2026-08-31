-- Pin the remaining customer-facing search RPC search paths without changing search logic.
-- Vector-dependent functions resolve the actual installed vector extension schema dynamically.
-- pg_temp is explicitly last to prevent temporary-object shadowing.

do $$
declare
  v_vector_schema text;
  v_fn record;
begin
  select n.nspname
    into v_vector_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';

  -- Unified text/geo search functions do not depend on extension functions/operators.
  for v_fn in
    select
      p.oid,
      p.proname,
      (
        select string_agg(format_type(arg_type, null), ', ' order by ord)
        from unnest(p.proargtypes::oid[]) with ordinality as args(arg_type, ord)
      ) as arg_types
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (p.proname = 'enterprise_search_locations' and p.pronargs = 14)
        or (p.proname = 'enterprise_search_recovery' and p.pronargs = 13)
      )
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, pg_temp',
      v_fn.proname,
      v_fn.arg_types
    );
  end loop;

  -- Semantic/vector search functions need the schema that owns the vector extension's operators.
  if v_vector_schema is not null then
    for v_fn in
      select
        p.oid,
        p.proname,
        (
          select string_agg(format_type(arg_type, null), ', ' order by ord)
          from unnest(p.proargtypes::oid[]) with ordinality as args(arg_type, ord)
        ) as arg_types
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (
          (p.proname = 'match_locations' and p.pronargs = 3)
          or (p.proname = 'match_theouthaven_full_sentence' and p.pronargs = 3)
          or (p.proname = 'search_activities_enterprise' and p.pronargs = 4)
          or (p.proname = 'search_restaurants_enterprise' and p.pronargs = 4)
          or (p.proname = 'search_restaurants_rpc' and p.pronargs = 5)
        )
    loop
      if v_vector_schema = 'public' then
        execute format(
          'alter function public.%I(%s) set search_path = public, pg_temp',
          v_fn.proname,
          v_fn.arg_types
        );
      else
        execute format(
          'alter function public.%I(%s) set search_path = public, %I, pg_temp',
          v_fn.proname,
          v_fn.arg_types,
          v_vector_schema
        );
      end if;
    end loop;
  end if;
end
$$;
