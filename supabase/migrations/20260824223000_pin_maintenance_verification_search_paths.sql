-- Pin search_path on low-risk SECURITY INVOKER maintenance and verification helpers.
-- No privilege, RLS, customer-facing search/booking, or business-logic changes.

alter function public.oh_calculate_location_quality(text,text,text,text,text,numeric,numeric,text,text,text,text,numeric,integer) set search_path = public;
alter function public.crm_can_delegate_territory_access(uuid,uuid,text) set search_path = public;
alter function public.get_location_hours_repair_candidates(integer) set search_path = public;
alter function public.verify_phase13_production_integration() set search_path = public;
