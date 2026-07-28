# Search Core V2 migration

## Production call graph

`POST /api/generate → public-api/controller → runOutingSearch → anchor normalization/resolution → enterprise parser/normalizer → enterprise RPC retrieval → ranking/ML Phase 1 and Phase 2 → pairing → post-filter recovery/guardrails → public normalization`.

## V2 call graph

`POST /api/generate → public-api/controller → runOutingSearch rollout gate → buildSearchPlan → enterprise_search_locations retrieval → evidence role assignment → deterministic score + existing ml_rank_v1 boost → bounded pairing → deterministic fallback → validation → pure V2 serializer → compatibility adapter`.

The existing `locations` table, public-search columns, coordinates, markets, UUIDs, `enterprise_search_locations` RPC, Haversine distance helper, and `lib/ml/locationRanking.ts` model version/boost are reused. No migration or duplicated inventory is required. Legacy remains only for rollback and is wholly bypassed for served V2 requests.

## Deployment and rollback

Deploy code with `SEARCH_CORE_VERSION=legacy`, enable `shadow`, inspect structured comparisons, then set `v2` with rollout 5/20/50/100. Rollback is one environment change to `legacy`; no database rollback is needed. Acceptance requires typecheck, lint, V2 tests, existing search regressions, build, database contract verification in the deployed Supabase environment, and monitoring latency/fulfillment.
