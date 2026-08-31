begin;

revoke all on function public.match_location_search_embeddings(vector, text, text, integer, numeric, text) from public, anon, authenticated;
grant execute on function public.match_location_search_embeddings(vector, text, text, integer, numeric, text) to service_role;

revoke all on function public.get_search_embedding_backfill_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_search_embedding_backfill_candidates(integer) to service_role;

commit;
