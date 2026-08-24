-- Restrict internal maintenance/admin SECURITY DEFINER functions to service-role execution.
-- These functions are invoked by server-side cron/admin/maintenance paths or are not
-- part of the public customer RPC surface.

revoke execute on function public.cleanup_expired_auth_email_tokens() from public, anon, authenticated;
grant execute on function public.cleanup_expired_auth_email_tokens() to service_role;

revoke execute on function public.crm_snapshot_forecast(date, text) from public, anon, authenticated;
grant execute on function public.crm_snapshot_forecast(date, text) to service_role;

revoke execute on function public.crm_sync_location_territory_assignments(uuid) from public, anon, authenticated;
grant execute on function public.crm_sync_location_territory_assignments(uuid) to service_role;

revoke execute on function public.get_theouthaven_cron_job_health() from public, anon, authenticated;
grant execute on function public.get_theouthaven_cron_job_health() to service_role;

revoke execute on function public.log_edge_function_run(text, text, text, text, uuid, jsonb, jsonb, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.log_edge_function_run(text, text, text, text, uuid, jsonb, jsonb, text, integer, jsonb) to service_role;

revoke execute on function public.oh_auto_merge_exact_live_duplicates(integer) from public, anon, authenticated;
grant execute on function public.oh_auto_merge_exact_live_duplicates(integer) to service_role;

revoke execute on function public.oh_find_live_location_duplicates(integer) from public, anon, authenticated;
grant execute on function public.oh_find_live_location_duplicates(integer) to service_role;

revoke execute on function public.oh_location_duplicate_review_summary() from public, anon, authenticated;
grant execute on function public.oh_location_duplicate_review_summary() to service_role;

revoke execute on function public.oh_refresh_location_identity() from public, anon, authenticated;
grant execute on function public.oh_refresh_location_identity() to service_role;

revoke execute on function public.oh_refresh_location_quality() from public, anon, authenticated;
grant execute on function public.oh_refresh_location_quality() to service_role;

revoke execute on function public.recalculate_business_crm_scores() from public, anon, authenticated;
grant execute on function public.recalculate_business_crm_scores() to service_role;

revoke execute on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

-- Pin search_path for maintenance functions that were still role-mutable.
alter function public.oh_auto_merge_exact_live_duplicates(integer) set search_path = public, pg_temp;
alter function public.oh_find_live_location_duplicates(integer) set search_path = public, pg_temp;
alter function public.oh_location_duplicate_review_summary() set search_path = public, pg_temp;
alter function public.oh_refresh_location_identity() set search_path = public, pg_temp;
alter function public.oh_refresh_location_quality() set search_path = public, pg_temp;
alter function public.recalculate_business_crm_scores() set search_path = public, pg_temp;
