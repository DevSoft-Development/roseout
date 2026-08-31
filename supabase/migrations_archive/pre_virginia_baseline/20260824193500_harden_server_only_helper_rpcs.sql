-- Restrict server-only SECURITY DEFINER helpers that are reached through
-- protected Next.js/service-role paths or internal trigger/helper calls.

revoke execute on function public.create_demo_session_from_template(uuid, text) from public, anon, authenticated;
grant execute on function public.create_demo_session_from_template(uuid, text) to service_role;

revoke execute on function public.reset_demo_session(uuid) from public, anon, authenticated;
grant execute on function public.reset_demo_session(uuid) to service_role;

revoke execute on function public.reserve_sync_bar_bookable_item(uuid) from public, anon, authenticated;
grant execute on function public.reserve_sync_bar_bookable_item(uuid) to service_role;

revoke execute on function public.reserve_sync_bar_seats_from_row(uuid) from public, anon, authenticated;
grant execute on function public.reserve_sync_bar_seats_from_row(uuid) to service_role;
