# Search reliability platform

This change replaces query-by-query launch gating with capability-level reliability measurement.

## Phase 1 — Stop semantic patching

- New aliases belong in `search_taxonomy_terms`, not retrieval functions.
- Runtime defects are classified by failure class before code changes are approved.
- `UNKNOWN_TAXONOMY` and `PROFILE_CLASSIFICATION_GAP` are operational queues, not reasons to add prompt-specific branches.

## Phase 2 — Audit canonical profile coverage

`search_profile_coverage_snapshots` stores geography, domain, canonical term, profile classification, geography validity, confidence, and pairability counts.

Required production thresholds:

- valid geography profiles >= 99%
- canonical domain coverage >= 98%
- canonical category coverage >= 95%
- zero searchable records with an unclassified domain

## Phase 3 — Backfill and validate inventory

Use the existing profile builder/backfill to rebuild canonical profiles after taxonomy changes. Ambiguous records must enter review rather than being inferred repeatedly at request time. Capture a new coverage snapshot after every backfill.

## Phase 4 — Make profile retrieval authoritative

The benchmark endpoint executes strict canonical-profile retrieval with legacy fallback disabled. Promotion from canary to primary is allowed only when canonical known-inventory recall and engine correctness are both at least 98%.

Legacy retrieval remains a shadow diagnostic until canonical recall is proven. It must not silently hide profile gaps in launch-gate measurements.

## Phase 5 — Run a stratified benchmark

Store 500–1,000 enabled cases in `search_benchmark_cases`. Each case has a class, expected behavior, and a `known_inventory_required` flag.

Recommended classes:

- restaurant-only
- activity-only
- ordinary paired outing
- exact walking distance
- exact mileage
- neighborhood
- borough
- Long Island city
- county
- anchor search
- family request
- nightlife request
- uncommon category
- expected no-result

Run:

```bash
SEARCH_BENCHMARK_BASE_URL=https://www.theouthaven.com \
SEARCH_BENCHMARK_ADMIN_TOKEN=... \
SEARCH_BENCHMARK_LIMIT=1000 \
node scripts/run-search-reliability-benchmark.mjs
```

The command exits non-zero when engine correctness or known-inventory recall is below 98%.

## Phase 6 — Operate data gaps separately

Failures are clustered as:

- `PARSER_FAILURE`
- `UNKNOWN_TAXONOMY`
- `NO_INVENTORY`
- `PROFILE_CLASSIFICATION_GAP`
- `RETRIEVAL_RECALL_FAILURE`
- `ROLE_ASSIGNMENT_FAILURE`
- `GEOGRAPHY_REJECTION`
- `HARD_DISTANCE_NO_PAIR`
- `RANKING_FAILURE`
- `SERIALIZATION_FAILURE`

`NO_INVENTORY` and `HARD_DISTANCE_NO_PAIR` can be correct engine outcomes when the benchmark case does not promise known inventory. They do not count as engine failures.

## Release gates

- engine correctness >= 98%
- known-inventory recall >= 98%
- hard constraint violations = 0
- geography leakage < 1%
- wrong-domain rate < 2%
- response contract failures = 0
- P95 latency < 3 seconds

Fulfillment rate is reported independently because inventory availability is not the same as engine correctness.
