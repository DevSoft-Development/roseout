-- Current-state launch hardening only. This migration extends existing systems;
-- it does not replace search, imports, CRM territories, or worker architecture.

-- Keep the location import staging schema aligned with the fields already
-- produced by lib/location-growth/shared.ts::applySearchQualityFields.
alter table public.location_import_staging
  add column if not exists is_chain boolean default false,
  add column if not exists brand_type text default 'independent',
  add column if not exists chain_brand text,
  add column if not exists date_score numeric default 50,
  add column if not exists search_boost numeric default 0;

-- The territory view is an internal CRM projection. Make it honor the
-- querying role's RLS and keep direct REST access service-role only.
alter view public.crm_location_territories set (security_invoker = true);
revoke all on public.crm_location_territories from anon, authenticated;
grant select on public.crm_location_territories to service_role;

-- Internal search reconciliation worker RPCs. These are called by trusted
-- server/edge worker code and should not be directly callable through the
-- public REST RPC surface.
revoke all on function public.claim_search_anchor_reconciliation_batch(integer, text) from public;
grant execute on function public.claim_search_anchor_reconciliation_batch(integer, text) to service_role;

revoke all on function public.complete_search_anchor_reconciliation(uuid, jsonb) from public;
grant execute on function public.complete_search_anchor_reconciliation(uuid, jsonb) to service_role;

revoke all on function public.fail_search_anchor_reconciliation(uuid, text, integer) from public;
grant execute on function public.fail_search_anchor_reconciliation(uuid, text, integer) to service_role;

revoke all on function public.prune_completed_search_anchor_reconciliation(integer, integer) from public;
grant execute on function public.prune_completed_search_anchor_reconciliation(integer, integer) to service_role;

revoke all on function public.queue_stale_search_anchor_locations(integer) from public;
grant execute on function public.queue_stale_search_anchor_locations(integer) to service_role;

revoke all on function public.release_stale_search_anchor_reconciliation_locks(integer) from public;
grant execute on function public.release_stale_search_anchor_reconciliation_locks(integer) to service_role;

revoke all on function public.disable_orphaned_search_anchors() from public;
grant execute on function public.disable_orphaned_search_anchors() to service_role;

-- Internal search evaluation / aggregation jobs.
revoke all on function public.evaluate_internal_search_test_run(uuid) from public;
grant execute on function public.evaluate_internal_search_test_run(uuid) to service_role;

revoke all on function public.create_internal_search_test_run(text, uuid) from public;
grant execute on function public.create_internal_search_test_run(text, uuid) to service_role;

revoke all on function public.recalculate_behavioral_search_features(interval) from public;
grant execute on function public.recalculate_behavioral_search_features(interval) to service_role;

revoke all on function public.finalize_search_outcome_aggregates(timestamp with time zone) from public;
grant execute on function public.finalize_search_outcome_aggregates(timestamp with time zone) to service_role;

-- Import quality/publishing operations are already invoked from trusted admin
-- or cron routes through the service-role Supabase client.
revoke all on function public.oh_refresh_staging_quality(uuid) from public;
grant execute on function public.oh_refresh_staging_quality(uuid) to service_role;

revoke all on function public.oh_find_staging_duplicates(uuid) from public;
grant execute on function public.oh_find_staging_duplicates(uuid) to service_role;

revoke all on function public.oh_publish_import_batch(uuid, integer) from public;
grant execute on function public.oh_publish_import_batch(uuid, integer) to service_role;

revoke all on function public.oh_publish_ready_staged_locations(integer) from public;
grant execute on function public.oh_publish_ready_staged_locations(integer) to service_role;

revoke all on function public.oh_cleanup_low_level_locations() from public;
grant execute on function public.oh_cleanup_low_level_locations() to service_role;

-- Analytics rollups are backend maintenance jobs, not end-user RPCs.
revoke all on function public.refresh_location_daily_analytics(date, date) from public;
grant execute on function public.refresh_location_daily_analytics(date, date) to service_role;

revoke all on function public.refresh_location_hourly_analytics(date, date) from public;
grant execute on function public.refresh_location_hourly_analytics(date, date) to service_role;

revoke all on function public.refresh_location_customer_insights(date, date) from public;
grant execute on function public.refresh_location_customer_insights(date, date) to service_role;
