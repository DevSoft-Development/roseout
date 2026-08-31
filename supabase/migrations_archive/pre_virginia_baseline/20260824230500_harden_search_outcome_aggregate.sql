-- Restrict the unused search-outcome aggregate writer to trusted server roles.
-- The helper exists in production but is not discoverable in tracked schema history,
-- so guard the migration for clean environments where it may be absent.

do $$
begin
  if to_regprocedure('public.upsert_search_outcome_aggregate(text,text,text,text,text,timestamp with time zone,jsonb)') is not null then
    execute 'revoke execute on function public.upsert_search_outcome_aggregate(text,text,text,text,text,timestamp with time zone,jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.upsert_search_outcome_aggregate(text,text,text,text,text,timestamp with time zone,jsonb) to postgres, service_role';
  end if;
end
$$;
