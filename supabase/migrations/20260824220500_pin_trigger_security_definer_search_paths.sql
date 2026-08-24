-- Pin search_path on trigger-only SECURITY DEFINER helpers already restricted to postgres/service_role.
-- No privilege, trigger, RLS, or business-logic changes.

alter function public.handle_new_user() set search_path = public;
alter function public.oh_preserve_restaurant_duplicate_master() set search_path = public;
