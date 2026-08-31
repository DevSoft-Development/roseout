-- Pin search_path on low-risk SECURITY INVOKER utility helpers.
-- No privilege, RLS, or customer-facing behavior changes.

alter function public.oh_jsonb_has_valid_photo(jsonb) set search_path = public;
alter function public.oh_is_wellness_activity(text,text) set search_path = public;
alter function public.oh_is_qualified_wellness_activity(text,text,numeric,integer,boolean,text,text) set search_path = public;
alter function public.toh_infer_market(text,text,text,text,text) set search_path = public;
