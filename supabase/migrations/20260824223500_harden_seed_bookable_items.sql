-- Harden internal bookable-item seeding helper when present.
-- The helper currently exists in production but is not part of tracked schema history,
-- so clean environments must be able to apply this migration safely when it is absent.

do $$
begin
  if to_regprocedure('public.seed_bookable_items(uuid,text)') is not null then
    execute 'alter function public.seed_bookable_items(uuid,text) set search_path = public';
    execute 'revoke execute on function public.seed_bookable_items(uuid,text) from public, anon, authenticated';
    execute 'grant execute on function public.seed_bookable_items(uuid,text) to postgres, service_role';
  end if;
end
$$;
