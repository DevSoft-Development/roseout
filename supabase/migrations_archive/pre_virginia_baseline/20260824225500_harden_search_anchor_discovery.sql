-- Restrict the unused search-anchor discovery write RPC to trusted server roles.
-- The function currently exists in production but is not discoverable in tracked schema history,
-- so guard the migration for clean environments where it may be absent.

do $$
begin
  if to_regprocedure('public.record_search_anchor_discovery(text,text,text,text,jsonb)') is not null then
    execute 'revoke execute on function public.record_search_anchor_discovery(text,text,text,text,jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.record_search_anchor_discovery(text,text,text,text,jsonb) to postgres, service_role';
  end if;
end
$$;
