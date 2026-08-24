-- Trigger functions execute through Postgres triggers; end users do not need
-- direct RPC EXECUTE permission on them. Keep trigger behavior unchanged while
-- removing the public REST RPC surface.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.oh_preserve_restaurant_duplicate_master() from public, anon, authenticated;
revoke execute on function public.queue_location_search_anchor_reconciliation() from public, anon, authenticated;
revoke execute on function public.reserve_bar_assignments_before_write() from public, anon, authenticated;
revoke execute on function public.reserve_release_assignments_after_delete() from public, anon, authenticated;
revoke execute on function public.reserve_sync_bar_bookable_item_trigger() from public, anon, authenticated;
revoke execute on function public.reserve_sync_bar_seats() from public, anon, authenticated;
revoke execute on function public.resolve_worker_configuration_events_after_success() from public, anon, authenticated;

grant execute on function public.handle_new_user() to service_role;
grant execute on function public.oh_preserve_restaurant_duplicate_master() to service_role;
grant execute on function public.queue_location_search_anchor_reconciliation() to service_role;
grant execute on function public.reserve_bar_assignments_before_write() to service_role;
grant execute on function public.reserve_release_assignments_after_delete() to service_role;
grant execute on function public.reserve_sync_bar_bookable_item_trigger() to service_role;
grant execute on function public.reserve_sync_bar_seats() to service_role;
grant execute on function public.resolve_worker_configuration_events_after_success() to service_role;
