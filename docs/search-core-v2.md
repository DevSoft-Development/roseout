# Search Core V2

Search Core V2 is the canonical `Planner → Retriever → Role Assignment → Scoring → Pairing → Fallback → Validation → Serializer` pipeline. `SearchPlan` is frozen and is the only intent object. Downstream stages may retain `rawQuery` for trace text but never inspect it for decisions.

## Data and taxonomy

The retriever calls the existing `enterprise_search_locations` RPC over the authoritative `locations` inventory and preserves UUIDs and public eligibility. It makes concurrent restaurant/activity calls, deduplicates IDs, and caps logical calls at four. Canonical taxonomies retain aliases and approved broad-category children separately.

## Evidence and ranking

Curated cuisine, activity type, primary category, and verified classification are authoritative; structured identity fields are strong; imported documents are supporting. Specialized roles require authoritative evidence or strong evidence plus support; supporting-only text never qualifies. Eligible candidates receive deterministic weights of intent 35%, role confidence 20%, geography 20%, quality 10%, features 8%, popularity 5%, and audience 2%. Existing `ml_rank_v1` scores add a bounded boost after eligibility and cannot restore rejected candidates.

Pairing evaluates at most 20 candidates per lane, accepts scarce lanes, enforces same-venue and walking constraints, and uses the existing Haversine infrastructure. Fallback is explicit and validation only enforces eligibility, role, market, duplication, and pair invariants. Serialization is pure and all counts use `response/resultCounts.ts`.

## Operations

`SEARCH_CORE_VERSION` supports `legacy`, `shadow`, and `v2`; `SEARCH_CORE_V2_ROLLOUT_PERCENT` deterministically buckets a user/session/query. Shadow work is unawaited and logs `SEARCH_CORE_V2_SHADOW`. Roll back immediately with `SEARCH_CORE_VERSION=legacy`. Deploy at 5%, 20%, 50%, then 100% while monitoring fulfillment, fallback, pair success, empty results, and P50/P95 stage timing.

To add a cuisine, activity, or feature, add one canonical taxonomy entry and aliases, then add evidence and QA cases—never a query-specific downstream condition. Debug failures through the plan, retrieval calls, role evidence, bounded score components, fallback reason, validation, and canonical counts.
