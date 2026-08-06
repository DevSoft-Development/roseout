# Public Search and Search Health QA Parity

## Production contract

Public search and Search Health Batch QA must execute the same search behavior:

- execution path: `/api/generate`
- controller: `createPublicSearchController`
- Search Core assignment: `v2_primary`
- Search Core traffic: 100%
- profile retrieval mode: `primary`
- canonical profile traffic: 100%
- profile kill switch: off
- legacy retrieval: bounded fallback only

QA may bypass rate limits and enable additional diagnostics, but it must not use a separate search engine, direct `searchV2()` call, rollout override, alternate planner, alternate retrieval policy, or alternate response contract.

## Deployment

1. Deploy the application from this branch.
2. Apply `20260806234000_enforce_public_qa_v2_canonical_parity.sql` through the normal Supabase migration workflow.
3. Open Search Health configuration and verify Search Core is V2 at 100% and canonical profiles are Primary at 100%.
4. Run the same prompt once through the public search UI and once through Search Health Batch QA.
5. Compare `assignedEngine`, `searchCoreAssignment`, normalized intent, retrieval decisions, served source, result IDs, pair IDs, fallback reason, and response contract.
6. Run the 100-query production replay and confirm no required regression, contract failure, or unexplained legacy fallback.

## Rollback

Use the existing profile kill switch to return profile retrieval to legacy behavior without disabling Search Core V2. Use the Search Core kill switch only for an engine-level emergency rollback.

## Required checks

- `npx vitest run lib/search/v2/tests/publicQaCanonicalParity.test.ts`
- existing Search Core and profile-rollout tests
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Supabase migration validation
