# Canonical Search Profile Primary Cutover

Search Core V2 remains the only public search engine. This cutover changes only its retrieval source from percentage-based canonical canary traffic to canonical profile retrieval for all V2 requests.

## Effective production state

- Search Core: `v2`, 100% public traffic
- Search profile retrieval: `primary`, 100%
- Kill switch: off
- Legacy retrieval: bounded fallback only
- Public contract: `public-search-v2`
- Search plan: `search-plan-v1`

A 100% canary is normalized to `primary` so configuration, diagnostics, and admin copy cannot describe full traffic as a canary.

## Safety behavior

- The profile kill switch normalizes the effective profile mode to `off` and percent to `0`.
- The Search Core kill switch remains the full-engine emergency rollback.
- Existing domain-scoped legacy fallback behavior remains available; this change does not remove fallback code or weaken hard geography, walking, role, pairing, or response contracts.
- The production replay continues to compare normal, canonical-primary, and strict canonical-no-fallback execution.

## Deployment

1. Merge and deploy the application changes.
2. Apply `20260806230000_promote_search_profile_primary.sql` through the normal Supabase migration workflow.
3. Confirm `app_settings.search_profile_rollout` equals `{ mode: "primary", canaryPercent: 100, killSwitch: false }`.
4. Confirm Search Health reports Search Core V2 at 100% and profile retrieval as primary.
5. Run the 100-query production replay.
6. Verify normal successful requests report canonical profile retrieval and legacy fallback only for documented bounded reasons.
7. Test the profile kill switch, then return it to off after rollback verification.

## Required validation

- `npx vitest run lib/search/v2/tests/searchProfilePrimaryCutover.test.ts`
- existing Search V2 and profile-rollout tests
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Supabase migration validation
- fresh 100-query production replay after deployment

## Rollback

Use the existing Search Profile kill switch for retrieval rollback. Use the Search Core kill switch only when the complete V2 engine must be rolled back.
