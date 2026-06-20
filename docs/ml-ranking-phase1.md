# ML Ranking Phase 1

Phase 1 adds a safe learned-ranking readiness layer for canonical `locations` search results.

## What it does
- Aggregates clean behavior signals into `location_ml_features`.
- Records recalculation jobs in `location_ml_score_runs`.
- Calculates deterministic `ml_rank_v1` scores from 0–100.
- Adds a small capped search boost: `min(20, max(0, ml_score) * 0.15)`.
- Exposes admin visibility at `/admin/dashboard/ml`.

## Data used
- `analytics_events` from the last 30 days for impressions, views, clicks, saves, and negative signals.
- `outings` from the last 30 days for saves, reservation/call/link clicks, and completion signals.
- Canonical `locations.id` only. Legacy restaurant/activity tables are not used for ranking.

## Why the score is capped
`ml_score` is intentionally additive and capped so it cannot overpower hard filters, domain matching, geography, category relevance, publishability, or pairing rules. Low sample sizes are dampened before scoring.

## Manual recalculation
After applying the migration, run:

```bash
curl -X POST "$APP_URL/api/admin/ml/recalculate-location-scores" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Development mode also allows admin/dev access using the same route.

## Monitor before public launch
- Last run status and error counts.
- Total scored locations.
- Average score shifts.
- High scores with fewer than 25 impressions.
- Search-health regressions and no-pair rates.
- Whether exact/geo/category matches remain stable.

## Next phases
- Query-specific learning.
- Personalized recommendations.
- Restaurant/activity pairing learning.
- Duplicate and bad-data detection.
- Category correction.
- Automated quality review queue.

## ML Admin Dashboard

The merged Machine Learning admin page is `/admin/dashboard/ml`. Phase 1 learned ranking and Phase 2 intent/pair scoring are shown together. `/admin/dashboard/ml/phase-2` now redirects to the merged dashboard.

## Why Phase 1 May Show 0 Rows

Phase 1 needs canonical location IDs from `search_events.metadata.ml_result_ids`, analytics event metadata such as `location_id`, or outings with restaurant/activity location IDs. `debugParity.firstResultNames` is not enough because names can be ambiguous and can credit the wrong location. Make new searches after the tracking update, then rerun Phase 1.

## Manual Verification

1. Run a new `/create` search.
2. Confirm the latest `search_events` row has `metadata.ml_result_ids`.
3. Run a mixed outing search.
4. Confirm the latest `search_events` row has `metadata.ml_pair_ids` if pairs were shown.
5. Run `/api/admin/ml/recalculate-location-scores`.
6. Confirm `location_ml_features` rows appear if Phase 1 exists.
7. Open `/admin/dashboard/ml`.
8. Open `/admin/dashboard/search-health` to test search impact if ML debug is installed.
