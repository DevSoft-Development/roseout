-- Some functions had explicit anon/authenticated EXECUTE grants in addition to
-- the default PUBLIC grant. Remove those direct grants as well, while keeping
-- trusted service-role execution intact.

revoke execute on function public.claim_search_anchor_reconciliation_batch(integer, text) from anon, authenticated;
revoke execute on function public.complete_search_anchor_reconciliation(uuid, jsonb) from anon, authenticated;
revoke execute on function public.fail_search_anchor_reconciliation(uuid, text, integer) from anon, authenticated;
revoke execute on function public.prune_completed_search_anchor_reconciliation(integer, integer) from anon, authenticated;
revoke execute on function public.queue_stale_search_anchor_locations(integer) from anon, authenticated;
revoke execute on function public.release_stale_search_anchor_reconciliation_locks(integer) from anon, authenticated;
revoke execute on function public.disable_orphaned_search_anchors() from anon, authenticated;

revoke execute on function public.evaluate_internal_search_test_run(uuid) from anon, authenticated;
revoke execute on function public.create_internal_search_test_run(text, uuid) from anon, authenticated;
revoke execute on function public.recalculate_behavioral_search_features(interval) from anon, authenticated;
revoke execute on function public.finalize_search_outcome_aggregates(timestamp with time zone) from anon, authenticated;

revoke execute on function public.oh_refresh_staging_quality(uuid) from anon, authenticated;
revoke execute on function public.oh_find_staging_duplicates(uuid) from anon, authenticated;
revoke execute on function public.oh_publish_import_batch(uuid, integer) from anon, authenticated;
revoke execute on function public.oh_publish_ready_staged_locations(integer) from anon, authenticated;
revoke execute on function public.oh_cleanup_low_level_locations() from anon, authenticated;

revoke execute on function public.refresh_location_daily_analytics(date, date) from anon, authenticated;
revoke execute on function public.refresh_location_hourly_analytics(date, date) from anon, authenticated;
revoke execute on function public.refresh_location_customer_insights(date, date) from anon, authenticated;
