-- Tighten Team Tools SECURITY DEFINER RPC exposure without changing the current server flow.
-- Current application paths use supabaseAdmin for helper lookups and direct table writes for work sessions.

-- Helper lookups take arbitrary user IDs and are server-only in the current codebase.
revoke execute on function public.get_allowed_work_types_for_user(uuid) from public, anon, authenticated;
grant execute on function public.get_allowed_work_types_for_user(uuid) to service_role;

revoke execute on function public.is_work_type_allowed_for_user(uuid,text) from public, anon, authenticated;
grant execute on function public.is_work_type_allowed_for_user(uuid,text) to service_role;

revoke execute on function public.can_user_access_workspace_location(uuid,uuid) from public, anon, authenticated;
grant execute on function public.can_user_access_workspace_location(uuid,uuid) to service_role;

-- Legacy work-session RPCs self-authorize with auth.uid(); preserve authenticated access for compatibility,
-- but remove anonymous/public execution.
revoke execute on function public.start_team_work_session(text,text,text,boolean,boolean,uuid,text) from public, anon;
grant execute on function public.start_team_work_session(text,text,text,boolean,boolean,uuid,text) to authenticated, service_role;

revoke execute on function public.end_team_work_session(uuid,text) from public, anon;
grant execute on function public.end_team_work_session(uuid,text) to authenticated, service_role;
