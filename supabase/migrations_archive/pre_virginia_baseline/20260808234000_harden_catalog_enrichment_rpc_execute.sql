begin;

revoke execute on function public.prepare_location_enrichment_run(uuid) from public, anon, authenticated;
revoke execute on function public.claim_location_enrichment_items(uuid, integer) from public, anon, authenticated;

grant execute on function public.prepare_location_enrichment_run(uuid) to service_role;
grant execute on function public.claim_location_enrichment_items(uuid, integer) to service_role;

commit;
