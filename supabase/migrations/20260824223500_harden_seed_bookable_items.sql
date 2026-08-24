-- Harden internal bookable-item seeding helper.
-- Pin search_path and remove public/client execution; preserve postgres/service_role access.

alter function public.seed_bookable_items(uuid,text) set search_path = public;
revoke execute on function public.seed_bookable_items(uuid,text) from public, anon, authenticated;
grant execute on function public.seed_bookable_items(uuid,text) to postgres, service_role;
