-- Pin search_path on low-risk SECURITY INVOKER location-classification helpers.
-- No privilege, RLS, or customer-facing behavior changes.

alter function public.oh_location_low_level_text(text,text,text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text) set search_path = public;
alter function public.oh_low_level_reason(text,text,numeric,integer,boolean,text,text,text,text) set search_path = public;
alter function public.oh_is_low_level_location(text,text,numeric,integer,boolean,text,text,text,text) set search_path = public;
