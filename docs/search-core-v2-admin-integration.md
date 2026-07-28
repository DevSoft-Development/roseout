# Search Core V2 admin, observability, and rollout integration

## Existing implementation reused

This integration calls the existing `searchV2` entrypoint and reuses `SearchPlan`, the public V2 response and compatibility adapter, `resultCounts`, `SearchTrace`, ML diagnostics, unified Supabase retrieval, and the existing QA tests. It does not add another planner, pipeline, count path, or ML path.

## Search Health and Search Lab

`/admin/dashboard/search-health` preserves Overview, existing searches/issues, filters, review workflows, and adds V2 QA, Metrics, Legacy vs V2, Search Plans, Role Evidence, ML Ranking, Fallbacks, Performance, Failures, and Configuration. Summary rows use additive `search_events` columns; full candidate traces stay in existing debug/trace storage and are loaded only for detail views. The shared V2 classifier treats pair and same-venue cards as satisfying both requested roles and labels fallback as successful, partial, or failed.

The embedded Search Lab offers admin-only Legacy, V2, and Compare request overrides. Overrides are passed by the authenticated admin route directly to orchestration, never accepted from the public API and never persisted. Compare runs are bounded to one execution per engine and suppress recursive shadow work.

## Configuration and deterministic assignment

Settings stores the rollout document in the existing `app_settings` table. Cached reads fall back to `SEARCH_CORE_VERSION` and `SEARCH_CORE_V2_ROLLOUT_PERCENT`; updates invalidate the cache and append an existing `admin_audit_logs` record with previous/new values and the optional reason.

Precedence is: authorized Search Lab override; emergency kill switch; internal-only restriction; persisted serving mode/percentage; environment default; Legacy fallback. Stable assignment uses FNV-1a over authenticated user ID, anonymous session ID, existing stable client ID, or request ID, in that order. Only key type and bucket `0..99` are recorded, never the raw identity key. `bucket < percentage` serves V2.

The kill switch immediately serves Legacy to normal traffic without deleting configuration or logs. Authorized Search Lab V2 remains available. Activating it and decreasing rollout remain easy; large increases, 100%, V2-only, and kill-switch deactivation use stronger confirmation.

## QA, metrics, digest, and deployment

QA run/case tables store summaries and trace references, not candidate payloads, with a partial unique index preventing concurrent full runs. Metrics and digest consumers should filter the indexed Search Health metadata and use stored canonical counts/classification. Existing recipients, cron routes, and delivery are unchanged.

Deploy the additive migration, then the application. Begin in Shadow, review QA/comparisons and fulfillment/no-result/P95 signals, then use 1%, 5%, 10%, 20%, 25%, 50%, 75%, and 100% as appropriate. Roll back by activating the kill switch or selecting Legacy only; if the database is unavailable, set `SEARCH_CORE_VERSION=legacy`. Troubleshoot with request ID, plan, canonical counts, classifier issue codes, stage timing, and trace metadata. Never expose prompts, credentials, or raw rollout keys.
