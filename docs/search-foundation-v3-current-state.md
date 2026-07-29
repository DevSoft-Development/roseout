# Search Foundation V3 current-state audit

Audit baseline: commit `093d402555758242de0a507be6078c5afc35e552` on 2026-07-29.

| Component | Baseline status | Findings / action |
|---|---|---|
| Search Core V2 | Already complete | V2 plan, retrieval, pairing, diagnostics, admin integration, and regression suites exist under `lib/search/v2` and `app/api/search/v2`. Built on rather than replaced. |
| Canonical taxonomy | Partially implemented | Split modules existed but used incompatible shapes and hard-coded activity expansion. Consolidated into a validated canonical entry schema. |
| `location_search_profiles` | Missing | No table or relationship existed. Added a forward migration with FK, facets, generated TSV, indexes, RLS, and grants. |
| Profile builder / validator | Missing | Added deterministic builder, evidence provenance, overrides, hash, confidence, and contradiction validation. |
| Refresh queue | Missing | Added durable queue schema and enqueue service. |
| Backfill runs / items | Missing | Added run tables, atomic lease claiming, cooperative cancellation, resume, retry, processor, admin controls, and worker endpoint. |
| Search Profiles admin page / API | Missing | Added live aggregate cards, searchable location table, rebuild controls, run creation and details. |
| CRM Search Profile | Missing | CRM contains extensive location inspection but no canonical profile panel; this remains a follow-on integration risk. |
| Search Health profile diagnostics | Missing | Existing Search Health is V2-focused; profile stage persistence is available in profile/run/shadow tables but the dashboard has not been expanded. |
| Shadow retrieval | Partially implemented | Existing ranking shadow infrastructure exists. Added comparison persistence schema; public request wiring still needs operational rollout configuration. |
| Parity evaluation | Missing | Existing regression corpora cover the requested query families, but no profile parity runner existed at baseline. |
| Live-music RPC / branch | Already complete but duplicated | `enterprise_search_live_music_locations` and a live-music runtime path exist. They are intentionally retained because parity has not been demonstrated against production data. |
| Supabase types | Broken | No generated Database type file or generation script existed; all four client wrappers are untyped. FKs exist for careers; profile FKs are supplied by the new migration. Connected generation cannot be run because no Supabase project/remote is configured. |
| Career application detail | Broken | One-line component used `app as any`, wildcard projections, and ignored seven query errors. Rewritten with explicit projections, normalized job relation, readable types, and error propagation. |
