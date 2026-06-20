# TheOutHaven ML Ranking Phase 2

## Overview
Phase 2 is a safe ML-readiness layer. It uses deterministic intent rules, existing Supabase analytics, search events, and outings data. It does not add external ML services, Python workers, paid training pipelines, or PII storage.

## Phase 2A: intent bucket detection
`lib/ml/intentBuckets.ts` classifies search text into a primary intent, secondary intents, grouped intents, confidence, and inferred search mode. Empty or unclear searches fall back to `general` with low confidence.

## Phase 2B: location intent scoring
`location_intent_ml_features` stores one row per `location_id + intent_bucket + market + location_type`. The recalculation route aggregates 7-day and 30-day behavior counters and writes a capped `intent_score` from 0 to 100.

## Phase 2C: pair scoring
`location_pair_ml_features` stores one row per restaurant/activity pair + intent + market. Completed outings, engagement, conversion, negative signals, and distance contribute to a capped `pair_score` from 0 to 100.

## Tables created
- `public.location_intent_ml_features`
- `public.location_pair_ml_features`
- `public.ml_phase2_score_runs`

All tables have RLS enabled and no public policies. Server/admin routes use the Supabase service role.

## Recalculation
Run:

```bash
curl -X POST https://theouthaven.com/api/admin/ml/recalculate-phase2 \
  -H "Authorization: Bearer $CRON_SECRET"
```

The route reads recent `analytics_events`, `search_events` if present, and `outings` if present. Missing optional tables/columns are handled as errors in the run metadata without breaking search.

## Ranking caps
- Location intent boost: `min(12, intent_score * 0.12)`.
- Pair boost: `min(15, pair_score * 0.15)`.
- Combined ML-related location boosts are capped at 25.

Hard filters and safeguards still win: publishability/searchability, geography, category/domain matching, location type, pairing constraints, distance, coordinates, and market guardrails.

## Monitor
- No-result searches.
- Top intent scores.
- Low-confidence high-score rows.
- Pair scores with too little data.
- Market leakage.
- Category leakage.
- Slow queries from score loading.

## Future Phase 3
- Personalization.
- User preference learning.
- Smart follow-up prompts.
- Personalized market/category ranking.
- Bad-data and category correction automation.
