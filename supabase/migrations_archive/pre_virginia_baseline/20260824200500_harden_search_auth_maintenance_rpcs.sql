-- Narrow current-state hardening for SECURITY DEFINER maintenance helpers.
-- These are internal server/trigger helpers, not customer-facing RPC endpoints.

revoke execute on function public.enqueue_search_anchor_reconciliation(uuid,text,text,integer,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_search_anchor_reconciliation(uuid,text,text,integer,timestamptz,jsonb) to service_role;

revoke execute on function public.expire_active_auth_email_tokens(text,text) from public, anon, authenticated;
grant execute on function public.expire_active_auth_email_tokens(text,text) to service_role;

-- search_anchor_is_admin() backs authenticated-only admin RLS policies.
revoke execute on function public.search_anchor_is_admin() from public, anon;
grant execute on function public.search_anchor_is_admin() to authenticated, service_role;
