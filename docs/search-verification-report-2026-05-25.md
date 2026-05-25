# Search Verification Report (2026-05-25)

## Scope
Re-ran verification for TheOutHaven search/recommendation updates against `/api/generate` with the six required queries.

## Latest patch presence
- Latest merge commit: `2fb3e54` (PR #342).
- Prior relevant patch commit: `69901bd` changed:
  - `app/api/generate/route.ts`
  - `lib/searchIntent.ts`
  - `docs/search-pipeline-audit-2026-05-25.md`

## Build/validation
- `npm ci`: PASS
- `npm run lint`: FAIL (pre-existing repo-wide lint violations, 468 errors).
- `npm run typecheck`: FAIL (`Missing script: typecheck`).
- `npm run build`: PASS.
- `npm test`: FAIL (`Missing script: test`).

## Runtime regression execution
All six queries were POSTed to `http://127.0.0.1:3000/api/generate` with JSON body `{ "input": "<query>" }`.

### Shared runtime blocker
Every query hit Supabase connectivity failures (`UND_ERR_CONNECT_TIMEOUT` / `EAI_AGAIN`) while trying to fetch search records, so the API returned:
- `success: true`
- `mode: "cards"`
- `restaurants: []`
- `activities: []`
- `pairs: []`
- `message: "We hit a temporary issue generating your outing cards. Please retry."`

This comes from the route error fallback branch.

## Query-by-query summary
1. `steak dinner and hookah lounge after dinner in Queens`
   - Intent parse: mixed, requiresRestaurant=true, requiresActivity=true, borough=queens.
   - Actual: empty cards arrays due Supabase fetch error.
   - Verdict: FAIL (cannot validate ranking/content correctness).

2. `seafood dinner and hookah in Queens`
   - Intent parse: mixed, requiresRestaurant=true, requiresActivity=true, borough=queens.
   - Actual: empty cards arrays due Supabase fetch error.
   - Verdict: FAIL.

3. `hookah lounge in Queens`
   - Intent parse: activity_only, shouldSearchRestaurants=false, shouldSearchActivities=true, borough=queens.
   - Actual: empty cards arrays due Supabase fetch error.
   - Verdict: FAIL.

4. `dessert after dinner in Queens`
   - Intent parse: restaurant_only with dessert as add-on intent, borough=queens.
   - Actual: empty cards arrays due Supabase fetch error.
   - Verdict: FAIL.

5. `steak restaurant in Queens`
   - Intent parse: restaurant_only, borough=queens.
   - Actual: empty cards arrays due Supabase fetch error.
   - Verdict: FAIL.

6. `group dinner in Queens`
   - Intent parse: restaurant_only, borough=queens.
   - Actual: empty cards arrays due Supabase fetch error.
   - Verdict: FAIL.

## Structured response + cards verification
- Response shape is deterministic and card-mode, not text-only.
- `cards`-ready arrays (`restaurants`, `activities`, `pairs`) exist in response shape but are empty under backend connectivity failure.
- `allowTextOnlyFallback` remains false in parsed canonical intent.

## Cache/version verification
- Cache version constant is present and includes canonical intent factors through `buildResponseCacheKey(input, intent)`.
- Runtime cache quality (stale data behavior) could not be fully validated because search source fetches failed before meaningful result payload generation.

## Required conclusion
Patch verification is **FAILED** in this environment because required regression outcomes (restaurant/activity correctness, borough correctness, ranked card outputs) cannot be validated when upstream search fetch fails for all queries.

### Exact failing branch/root cause observed at runtime
- Root issue: Supabase network lookup/timeout (`hnhbzynoyrhjndefbwkh.supabase.co`) during search fetch path.
- Failure branch: `/api/generate` catch path returning the fixed temporary-issue cards response.

## Is a new patch required?
- App logic patch for intent routing is present.
- Immediate blocker is environment/runtime data-source connectivity; fix that first.
- If connectivity is restored and any of the listed semantic failures still happen, then a new search logic patch is required.
