-- Pin search_path on additional low-risk SECURITY INVOKER utility helpers.
-- No privilege, RLS, or business-logic changes.

alter function public.kb_normalized_role(text) set search_path = public;
alter function public.normalize_search_anchor_name(text) set search_path = public;
alter function public.oh_is_nyc_import_source(text) set search_path = public;
alter function public.oh_is_valid_photo_text(text) set search_path = public;
alter function public.toh_clean_street_address(text,text,text,text) set search_path = public;
