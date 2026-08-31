-- Remove anonymous execution from the legacy admin RLS helper.
-- Authenticated access remains because the helper backs authenticated-only RLS policies.

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
