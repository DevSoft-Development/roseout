-- Pin search_path on low-risk SECURITY INVOKER utility helpers.
-- No privilege, RLS, or business-logic changes.

alter function public.crm_territory_access_rank(text) set search_path = public;
alter function public.get_allowed_work_types_for_team_type(text) set search_path = public;
alter function public.merge_text_arrays(text[],text[]) set search_path = public;
alter function public.oh_normalize_phone(text) set search_path = public;
alter function public.oh_safe_lower_text(text) set search_path = public;
alter function public.reserve_is_bar_type(text) set search_path = public;
alter function public.reserve_minutes(text) set search_path = public;
alter function public.search_outcome_state_rank(text) set search_path = public;
alter function public.team_tools_global_work_types() set search_path = public;
