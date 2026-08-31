-- Internal eligibility functions are intentionally unavailable to anon/authenticated
-- callers, but trigger/admin execution runs through the service role.
grant execute on function public.toh_effective_source_searchable(text, boolean, boolean, text, text, text, text, text, double precision, double precision, text, text, text[]) to service_role;
grant execute on function public.toh_normalize_source_searchability() to service_role;
grant execute on function public.toh_location_source_eligibility(uuid) to service_role;
grant execute on function public.toh_reconcile_location_eligibility(uuid) to service_role;
grant execute on function public.toh_sync_source_eligibility_to_locations() to service_role;
grant execute on function public.toh_sync_location_identity_eligibility() to service_role;
