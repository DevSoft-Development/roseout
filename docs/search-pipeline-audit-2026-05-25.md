# Search Pipeline Audit (2026-05-25)

## Architecture map
1. Query enters `app/api/generate/route.ts` POST handler.
2. `parseSearchIntent` from `lib/searchIntent.ts` builds canonical intent.
3. Route derives restaurant/activity embedding/search text and cache key.
4. Supabase sources loaded by `fetchFallbackRecords` and supporting fallback records.
5. Route separates candidates into restaurant/activity arrays.
6. Intent-aware filters + geo filters + fallback stages refine each domain.
7. Per-domain ranking runs with semantic boost and marketplace boosts.
8. Smart balancing/pairing creates outing pairs.
9. Final response maps to card payload arrays.

## Conflicts and stale logic found
- Duplicate intent systems existed: deterministic parser + LLM parser + smart match parser.
- Local-first LLM parser could over-constrain/override deterministic geo and meal intent.
- Cache key missed canonical explicit-term signature, allowing stale cross-intent reuse.

## Fixes implemented
- Canonical intent expanded with explicit domain requirements and flags.
- Route now derives local filter input from canonical intent (removed LLM dependency for filtering path).
- Cache version bumped and cache key includes borough/neighborhood/add-on/explicit terms.
- Response payload hardened to explicit card mode shape with normalized fields (`id/name/type/category/borough`).

## Remaining follow-up
- Split oversized `route.ts` into `intent`, `domain-search`, `ranking`, `response-normalization` modules.
- Remove dormant smart-match branch once A/B is complete.
