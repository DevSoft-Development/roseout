# Edge worker migration

## Audit inventory

Inventory command: `rg -n "maxDuration|runtime\s*=\s*['\"]nodejs" app supabase docs package.json next.config.* vercel.json`.

## Migration matrix

| Current route | Responsibility | Runtime | Proposed job type | Edge Function | Reusable service/RPC | Compatibility route | Delete? | Rollout flag | Verification |
|---|---|---:|---|---|---|---|---|---|---|
| `/api/cron/search-anchor-reconciliation` | Queue stale anchors, reconcile linked locations, disable orphaned anchors | nodejs, formerly 300s | `search.anchor.reconcile` | `job-worker` | existing search-anchor RPCs and `syncApprovedLocationsToSearchAnchors` | Yes, now enqueue-only | Later | `EDGE_WORKERS_ENABLED` | worker counters and anchor status samples |
| `/api/admin/ml/recalculate-booking-likelihood` | Booking-likelihood score recalculation | nodejs, formerly 300s | `ml.booking_likelihood.recalculate` | `job-worker` | `recalculateBookingLikelihood` scoring model | Yes, now enqueue-only | Later | `EDGE_WORKER_ENQUEUE_ONLY` | score diff and job result metadata |
| `/api/admin/search-health/batch-run` | Search-health batch QA | nodejs | `search.qa.batch` | `job-worker` | production search implementation | Planned | No | `EDGE_WORKERS_ENABLED` | `search_qa_runs`/`search_qa_results` |
| `/api/admin/location-growth/classify-chains` | Chain classification | nodejs, 300s | `location.chain_classify` | `job-worker` | existing chain detection helpers | Planned | No | `EDGE_WORKERS_ENABLED` | dry-run changed classifications |
| `/api/admin/run-google-import` | Google Places import | nodejs, 300s | `import.google_places` | `job-worker` | existing import filters/dedupe | Planned | No | `EDGE_WORKERS_ENABLED` | `import_job_results` counters |
| `/api/admin/location-growth/import-nyc-restaurants` | NYC restaurant import | nodejs, 300s | `import.nyc_restaurants` | `job-worker` | existing staging import logic | Planned | No | `EDGE_WORKERS_ENABLED` | staging counters |
| `/api/admin/location-growth/import-osm-activities` | OSM activity import | nodejs, 300s | `import.osm_activities` | `job-worker` | existing OSM import logic | Planned | No | `EDGE_WORKERS_ENABLED` | rate-limit counters |
| `/api/admin/location-growth/enrich-high-value` | High-value enrichment | nodejs, 300s | `enrichment.google_metadata` | `job-worker` | Google enrichment modules | Planned | No | `EDGE_WORKERS_ENABLED` | enriched/skipped counters |
| `/api/admin/location-growth/cache-google-photos` | Photo caching | nodejs, 300s | `enrichment.google_photos` | `job-worker` | photo cache helpers | Planned | No | `EDGE_WORKERS_ENABLED` | photo rows and provider IDs |
| `/api/admin/location-growth/migrate-enriched-photos` | Enriched photo migration | nodejs, 300s | `location.backfill` | `job-worker` | allowlisted backfill handler | Planned | No | `EDGE_WORKERS_ENABLED` | migrated/skipped counters |
| `/api/admin/restaurants/enrich-google-metadata` | Restaurant Google metadata enrichment | nodejs, 300s | `enrichment.google_metadata` | `job-worker` | restaurant enrichment logic | Planned | No | `EDGE_WORKERS_ENABLED` | sampled metadata parity |
| `/api/admin/backfill-reservation-links` | Reservation-link backfill | nodejs, 300s | `location.backfill` | `job-worker` | allowlisted backfill handler | Planned | No | `EDGE_WORKERS_ENABLED` | link count deltas |
| `/api/admin/location-growth/generate-missing-qrs` | Missing QR generation | nodejs, 300s | `location.backfill` | `job-worker` | QR service | Planned | No | `EDGE_WORKERS_ENABLED` | generated QR count |
| `/api/admin/location-growth/dedupe` | Staged deduplication | nodejs, 300s | `ml.duplicate_detection.recalculate` | `job-worker` | duplicate scoring logic | Planned | No | `EDGE_WORKERS_ENABLED` | duplicate candidate parity |
| `/api/admin/location-growth/score-staged` | Score staged imports | nodejs, 300s | `ml.location_scores.recalculate` | `job-worker` | scoring modules | Planned | No | `EDGE_WORKERS_ENABLED` | score distribution |
| `/api/admin/location-growth/publish` | Publish staged records | nodejs, 300s | `location.backfill` | `job-worker` | staged publishing logic | Planned | No | `EDGE_WORKERS_ENABLED` | audit inserted/updated/skipped |
| `/api/admin/locations/cleanup-missing-address` | Address cleanup | nodejs, 300s | `location.backfill` | `job-worker` | cleanup logic | Planned | No | `EDGE_WORKERS_ENABLED` | cleanup counters |
| `/api/admin/cleanup-locations` | Location cleanup | nodejs, 300s | `location.backfill` | `job-worker` | cleanup logic | Planned | No | `EDGE_WORKERS_ENABLED` | changed rows |
| `/api/admin/sync-locations` | Location synchronization | nodejs, 300s | `location.backfill` | `job-worker` | sync logic | Planned | No | `EDGE_WORKERS_ENABLED` | sync counters |
| `/api/admin/semantic-nightly` | Semantic maintenance | nodejs, 300s | `search.maintenance` | `job-worker` | semantic/search maintenance helpers | Planned | No | `EDGE_WORKERS_ENABLED` | diagnostics |
| `/api/admin/search-benchmark/run` | Search benchmark run | nodejs, 300s | `search.parity.evaluate` | `job-worker` | search benchmark tables | Planned | No | `EDGE_SEARCH_SHADOW_ENABLED` | benchmark scorecard |
| `/api/cron/search-phase4b-evaluation` | Search evaluation cron | nodejs, 300s | `search.parity.evaluate` | `job-worker` | search parity tables | Planned | No | `EDGE_SEARCH_SHADOW_ENABLED` | parity score |
| `/api/cron/search-phase13-maintenance` | Search maintenance cron | nodejs, 300s | `search.maintenance` | `job-worker` | maintenance helpers | Planned | No | `EDGE_WORKERS_ENABLED` | maintenance counters |
| `/api/cron/nightly-photo-backfill` | Photo backfill duplicate cron risk | nodejs, 300s | `enrichment.google_photos` | `job-worker` or existing `nightly-photo-backfill` | existing Edge photo backfill | Candidate proxy deletion after cron cutover | Later | `EDGE_WORKERS_ENABLED` | no duplicate schedules |

## Existing platform notes

Existing Edge Functions include reservation reminders, status cleanup, daily digests, admin digests, search-health digest, photo backfill, demo reset, team watchdog, geocode/enrichment, and search intent parsing. Existing pg_cron setup appears in `supabase/sql/setup-edge-function-crons.sql`, `supabase/search-health-digest-cron.sql`, and reservation cron migrations.

## Added worker platform

The additive migration creates durable worker, notification, search QA, search parity, and import result tables. Service-role RPCs cover enqueue, `FOR UPDATE SKIP LOCKED` claims, progress, heartbeat, completion, failure/backoff, cancellation, retry, and stale lease recovery. Flags default safe/off: `EDGE_WORKERS_ENABLED=false`, `EDGE_WORKER_ENQUEUE_ONLY=true`, `EDGE_SEARCH_SHADOW_ENABLED=false`, `EDGE_SEARCH_CANDIDATE_PERCENT=0`, and `EDGE_SEARCH_READ_ENABLED=false`.
