# Location Intelligence dedupe classifier

## Current production facts

Production Supabase: Virginia (`ftdsltatyqhtllyyefzp`).

As of 2026-09-04, the unresolved publish-ready cleanup population is 775 locations. None are claimed.

The first exact-evidence split is:

- 49 locations collide with another live location on exact `google_place_id`.
- 48 of those 49 already have a pending `location_duplicate_review` row.
- 1 exact Google-ID collision is missing from the review queue.
- 726 locations have no exact collision on Google Place ID, `location_key`, or normalized name+address, and have no pending duplicate review.

The existing duplicate engine already provides the correct base primitives:

- exact Google Place ID
- exact `location_key`
- exact normalized name + normalized address + city/state
- normalized phone + name similarity
- same normalized address + name similarity
- canonical merge through `oh_merge_live_location_duplicate`
- review decisions through `location_duplicate_review`
- searchable duplicate protection through `oh_prevent_searchable_exact_duplicate`

Do not replace these with a second duplicate system.

## Design goal

Resolve `duplicate_status = unknown` deterministically while minimizing false merges. The classifier must be evidence-based, auditable, owner-safe, batchable, and independent of paid Google calls.

The output for each candidate is one of:

1. `duplicate_auto_merge`
2. `unique_auto_clear`
3. `manual_review`
4. `defer_insufficient_evidence`

No classification alone makes a location searchable. Search publication remains a separate readiness decision after Search Profile rebuild and safety recheck.

## Stage 0 — hard safety guards

Always force `manual_review` or skip automation when any of these are true:

- either record is claimed or owner-managed
- either record is intentionally hidden/inactive/deleted
- either record already has a canonical `duplicate_of`
- location domains conflict materially, such as restaurant versus unrelated activity, unless exact Google identity plus corroborating evidence proves one business record
- the candidate pair has an explicit prior `not_duplicate` or `ignored` decision that has not been invalidated by stronger new evidence
- the proposed master would overwrite stronger first-party/owner data

## Stage 1 — exact duplicate evidence

### Tier D100 — exact Google Place ID

Evidence:

- same non-empty `google_place_id`

Default confidence: 1.00.

Action:

- if neither side is claimed and no hard conflict exists, route to `duplicate_auto_merge`
- if names/types materially conflict, keep confidence high for identity but route to `manual_review` rather than merge blindly
- always create/refresh a `location_duplicate_review` row first so the decision is auditable

Master selection order:

1. claimed / owner-managed
2. already-searchable canonical record
3. stronger first-party content
4. richer image coverage
5. higher quality score
6. higher review count
7. older canonical record as final stable tie-breaker

The existing merge RPC remains authoritative.

### Tier D98 — exact location identity without Google conflict

Evidence:

- same `location_key`, or
- exact normalized name + normalized address + city/state
- and no conflicting non-empty Google Place IDs

Action: `duplicate_auto_merge` unless a hard guard applies.

### Tier D95 — phone/name duplicate candidate

Evidence:

- same normalized phone
- name similarity >= 0.72
- compatible city/state or close coordinates

Action: `manual_review` initially. After calibration on reviewed examples this tier may graduate to auto-merge only if false-positive rate is effectively zero.

## Stage 2 — exact negative evidence / auto-unique

The current 726-record residual set is the main candidate population for automatic uniqueness.

A record may become `unique_auto_clear` only when all of the following are true:

- no exact Google Place ID collision
- no `location_key` collision
- no exact normalized name+address collision
- no pending duplicate review
- no claimed/owner conflict
- no nearby fuzzy candidate above the review threshold from Stage 3
- no explicit duplicate relationship

Recommended confidence: 0.99 when a non-empty Google Place ID is globally unique in the live catalog and all exact/fuzzy checks are negative; 0.97 without a Google Place ID but with strong unique identity fields.

Action:

- set `duplicate_status = unique`
- do not set `is_searchable` in the same transaction
- record classifier version, evidence, confidence, and decided timestamp
- enqueue Search Profile rebuild/readiness evaluation separately

## Stage 3 — bounded fuzzy residual review

Run only for records that survive exact checks. Never perform an unbounded all-to-all similarity query in production.

Candidate generation should be indexed/bounded first by one or more of:

- same normalized address
- same normalized phone
- same city + small coordinate radius
- same normalized name prefix/token signature

Then score only that small candidate set.

Suggested evidence weights:

- same Google Place ID: decisive duplicate evidence
- same location key: decisive unless conflicting Google IDs
- same normalized name+address: very strong
- same phone: strong
- name trigram similarity: supporting only
- distance <= 50 m: supporting
- same website host: supporting
- same reservation URL/provider identity: supporting
- conflicting Google IDs: strong negative evidence
- distant coordinates: strong negative evidence
- explicit `not_duplicate`: strong negative unless materially stronger new evidence appears

Suggested routing:

- score >= 0.98 with no conflicts: duplicate candidate eligible for auto-merge after calibration
- 0.90–0.979: manual review
- 0.75–0.899: manual review only when other supporting evidence exists; otherwise auto-unique candidate
- < 0.75 and no exact collision: unique candidate

Do not make these fuzzy thresholds permanent until validated against reviewed production pairs.

## Audit model

Every classifier decision should persist:

- `location_id`
- optional `paired_location_id`
- classifier version
- classification
- confidence
- evidence codes
- negative evidence codes
- suggested master ID
- decision source (`auto_exact`, `auto_negative`, `manual`, `admin_override`)
- created/decided timestamps

Prefer a dedicated internal audit table or extend `location_duplicate_review`; do not hide classifier state only in application logs.

## Batch architecture

Use the existing AWS background runtime and durable SQS queue.

Pipeline:

1. select up to 25 unresolved locations
2. Stage 0 guards
3. exact evidence checks
4. create/refresh duplicate-review rows for positive pairs
5. bounded fuzzy candidate generation only for residuals
6. persist classification/audit result
7. auto-merge only exact/high-confidence safe duplicates
8. auto-clear only high-confidence unique records
9. enqueue Search Profile rebuild/readiness evaluation separately
10. chain the next SQS batch only when measurable progress occurs

No new EventBridge schedule is required; reuse the existing catalog/location-intelligence maintenance path.

## Initial production rollout

### Phase A — read-only classifier

Run the classifier against all 775 and produce counts only. No status updates or merges.

Required acceptance checks:

- exact collision count remains explainable against current 49
- all existing pending review pairs are preserved
- claimed count remains protected
- no paid Google calls
- no searchability mutations

### Phase B — exact duplicate canary

Process at most 5 exact Google-ID collision pairs.

- create/refresh review row
- choose master using deterministic authority order
- merge only when no guard triggers
- verify child becomes non-searchable duplicate of the correct master
- verify master data is not degraded

### Phase C — auto-unique canary

Process at most 10 of the 726 residual records that pass all negative/fuzzy checks.

- mark only `duplicate_status = unique`
- rebuild Search Profile
- run readiness evaluator
- publish only if all independent readiness gates pass

### Phase D — scale

Increase to batches of 25–50 after zero unsafe decisions in the canaries.

## Canary result that preceded this design

PR #2463 merged at `8035a64719e915057e9e99802ff50a339c1210a6` and invoked the production AWS cleanup path.

The AWS managed cleanup run selected 10 publish-ready, already-unique records, performed 0 Google calls, and published 0. All 10 stopped on `search_profile_needs_review`. Production audit showed 0 unsafe publications and the 775 unresolved-dedupe population remained untouched.

This demonstrates the required separation between dedupe resolution and search publication: a location may be dedupe-safe yet still fail Search Profile readiness.