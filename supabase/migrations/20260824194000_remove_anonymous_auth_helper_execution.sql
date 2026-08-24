-- These SECURITY DEFINER helpers are used by authenticated-only RLS policies.
-- Keep authenticated/service_role execution while removing anonymous/public API access.

revoke execute on function public.current_admin_role() from public, anon;
grant execute on function public.current_admin_role() to authenticated, service_role;

revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated, service_role;

revoke execute on function public.can_view_location_analytics(uuid) from public, anon;
grant execute on function public.can_view_location_analytics(uuid) to authenticated, service_role;

revoke execute on function public.is_location_analytics_admin() from public, anon;
grant execute on function public.is_location_analytics_admin() to authenticated, service_role;

revoke execute on function public.crm_communication_role() from public, anon;
grant execute on function public.crm_communication_role() to authenticated, service_role;

revoke execute on function public.crm_is_admin() from public, anon;
grant execute on function public.crm_is_admin() to authenticated, service_role;

revoke execute on function public.kb_can_view_internal_article(text[]) from public, anon;
grant execute on function public.kb_can_view_internal_article(text[]) to authenticated, service_role;

revoke execute on function public.kb_current_admin_role() from public, anon;
grant execute on function public.kb_current_admin_role() to authenticated, service_role;

revoke execute on function public.kb_is_admin_manager() from public, anon;
grant execute on function public.kb_is_admin_manager() to authenticated, service_role;
