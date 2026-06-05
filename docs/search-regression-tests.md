# TheOutHaven Enterprise Search Regression Tests

The enterprise search regression suite protects behavior in `lib/search/enterprise` with deterministic fixtures and pure helper tests. It is designed to run without Supabase credentials and without live RPC calls.

## How to run

```bash
npm run test:search
```

Before search-related changes, also run the broader project checks when practical:

```bash
npm run lint
npm test
npm run build
```

## Behavior protected

The suite covers:

- Default NYC + Long Island market fallback when a query has no explicit geo.
- Explicit geo handling for Brooklyn, Long Island, Hoboken, and Queens.
- Mixed outing parsing for restaurant + activity requests.
- Rooftop activity discovery and theater suppression unless theater/theatre is requested.
- Walking-distance parsing, strict walking-minute constraints, walking-route rejection reasons, and no-valid-pair reasons.
- Walking labels versus miles labels, including cleanup of unsafe Google walking-route wording.
- Restaurant, activity, and pair quality ranking so quality tiers are not overpowered by tiny distance differences.
- Visible label cleanup for raw labels such as `fine_dining` and `rooftop_bar`.
- Search Health event classification, logging decisions, and debug payload preview limits.
- Public warning-only logging for no-valid-walking-pair events.

## Adding a fixture

Fixtures live in:

```text
lib/search/enterprise/__tests__/fixtures.ts
```

When adding a restaurant or activity fixture, include enough fields for search/ranking behavior:

- `id`, `name`
- `city`, `borough`, `county`, `state`
- `latitude`, `longitude`
- `rating`, `review_count`
- `has_photos`, `quality_status`, `public_visibility_tier`, `curation_tier`, `is_low_level`
- `location_type`, `primary_category`, `category`
- Restaurant-specific `cuisine`
- Activity-specific `activity_type`
- `tags`, `description`, `search_document`, `google_types`

Keep fixtures small, explicit, and deterministic. Do not fetch live Supabase rows for these tests.

## Adding a regression case

Add pure-pipeline regression cases to:

```text
lib/search/enterprise/__tests__/regression.test.ts
```

Prefer assertions on protected behavior rather than incidental exact ordering unless ordering is the behavior being protected. If a behavior can be tested at the helper level, add the focused test to the relevant file (`intent.test.ts`, `pairing.test.ts`, `quality-ranking.test.ts`, `distance-labels.test.ts`, or `search-health.test.ts`).

## No live Supabase

These tests must not import API routes or call live Supabase. Use fixtures and pure helpers only. If a production helper is hard to test, export the pure helper; do not export server-only functions that require service-role access.

## Codex update reminder

Run `npm run test:search` before completing search-related Codex updates so future changes do not regress enterprise search behavior.
