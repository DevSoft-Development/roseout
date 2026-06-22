
## Phase 2 — Build, Typecheck, Lint, Dependency Fixes

Date: 2026-06-22

### Files changed

- `docs/production-hardening-report.md` — created this Phase 2 repair report and recorded verification results.

### Errors fixed

- No build, TypeScript, or ESLint errors were present during the required baseline run.
- No dependency updates were applied because `npm audit --audit-level=high` could not complete: the npm audit endpoint returned `403 Forbidden`.
- Existing ESLint warnings remain warnings only and do not block `npm run lint`; broad lint cleanup was intentionally deferred because this phase is strict repair mode and the required commands already pass.

### Commands run

- `cat AGENTS.md && [ -f docs/production-hardening-audit.md ] && sed -n '1,240p' docs/production-hardening-audit.md || true && cat package.json`
- `find node_modules/next/dist/docs -maxdepth 2 -type f | head -40 && npm run typecheck`
- `sed -n '1,200p' node_modules/next/dist/docs/01-app/index.md`
- `npm run lint`
- `npm run build`
- `npm audit --audit-level=high`

### Commands passed

- `npm run typecheck` — passed.
- `npm run lint` — passed with 1,839 warnings and 0 errors.
- `npm run build` — passed; Next.js 16.2.4 production build completed successfully.

### Commands failed

- `npm audit --audit-level=high` — failed because the npm registry audit endpoint returned `403 Forbidden - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`.

### Remaining dependency risks

- Dependency vulnerability status remains unknown until `npm audit --audit-level=high` can run successfully in an environment with audit endpoint access.
- No `npm audit fix` or dependency upgrade was attempted because npm did not return actionable advisory data.

### Remaining known risks

- Lint still reports 1,839 warnings, primarily `@typescript-eslint/no-explicit-any`, React hook purity/effect warnings, and unused variables. These are non-blocking today but should be reduced in a dedicated cleanup phase.
- The Phase 1 production hardening audit findings remain open, including admin/debug/cron route hardening, service-role route review, Supabase schema/RLS verification, and live/preview E2E coverage.
- `npm audit --audit-level=high` remains a release blocker until it completes successfully or an approved alternative vulnerability scan is documented.

## Combined Phase 3 and Phase 5 — Admin API, Service Role, Cron, Import, and Backfill Security

Date: 2026-06-22

### Admin routes audited

- Reviewed the existing admin API inventory in `docs/production-admin-api-audit.md` and the high-risk findings in `docs/production-hardening-audit.md`.
- Re-inspected privileged route helpers in `lib/admin-api-auth.ts`, `lib/admin-auth.ts`, `lib/admin-permissions.ts`, and service-role helpers in `lib/supabase-admin.ts`.
- Re-inspected high-risk admin/system routes that were previously marked for manual review or had service-role mutations: location-growth photo diagnostics, location publishability repair, admin user detail/mutation/password reset, health-intelligence import, cron beta reminders, daily admin digest, nightly photo backfill, and Google specialty import.

### Routes changed

- `app/api/admin/location-growth/photo-debug/route.ts`
  - Added server-side superadmin authorization before service-role reads.
  - Replaced raw Supabase error exposure with a sanitized JSON error.
- `app/api/admin/locations/[locationId]/repair-publishability/route.ts`
  - Converted from page-style redirect auth to API JSON auth using superadmin-only access.
  - Sanitized service-role read/update errors.
  - Added safe action/count response fields.
- `app/api/admin/users/[userId]/route.ts`
  - Added superadmin API authorization before user detail, role, plan, profile, and delete/disable actions.
  - Replaced leaked exception messages with safe JSON errors.
- `app/api/admin/users/[userId]/password-reset/route.ts`
  - Added superadmin API authorization before password reset send/audit logging.
  - Replaced leaked exception messages with safe JSON errors.
- `app/api/admin/health-intelligence/import/route.ts`
  - Added cron-secret or superadmin authorization before creating/using the service-role client.
  - Switched to the central service-role helper instead of creating a route-local service-role client.
  - Added a safe action field in the response.
- `app/api/google/specialty-import/route.ts`
  - Kept trusted internal import/cron-secret access for scheduled/internal calls.
  - Added superadmin authorization for manual calls.
- `app/api/cron/beta-reminders/route.ts`
  - Removed query-string cron secret acceptance by moving to the shared cron helper.
  - Added safe action/count response fields.
- `app/api/cron/daily-admin-digest/route.ts`
  - Removed query-string cron secret acceptance.
  - Reduced the public JSON response to safe send status and aggregate counts instead of returning provider details.
- `app/api/cron/nightly-photo-backfill/route.ts`
  - Made cron authorization fail closed in production when `CRON_SECRET` is missing or incorrect.
  - Stopped sending empty internal import secrets.
  - Added safe action/count response fields.

### Service-role usage reviewed

- Confirmed central service-role helper remains `lib/supabase-admin.ts`.
- Added `requireSuperAdmin()` in `lib/admin-api-auth.ts` so API routes can consistently require superadmin and return JSON 401/403 instead of redirects.
- Added `lib/cron-auth.ts` for shared fail-closed cron-secret verification.
- Removed the route-local `createClient(...SUPABASE_SERVICE_ROLE_KEY...)` from `app/api/admin/health-intelligence/import/route.ts` and replaced it with `getSupabaseAdminClient()` after authorization.
- Confirmed changed routes perform authorization before service-role reads/mutations.
- No service-role keys are returned in API responses.

### Security helpers changed

- `lib/admin-api-auth.ts`
  - Added `requireSuperAdmin()` wrapper around `requireAdminApiRole(["superadmin"])`.
  - Added a small `safeAdminError()` JSON helper for future API hardening.
- `lib/cron-auth.ts`
  - Added shared cron verification that accepts `Authorization: Bearer <CRON_SECRET>` and the existing `x-cron-secret` trusted header, but does not accept query-string secrets.
  - Fails closed in production when `CRON_SECRET` is missing.

### Cron/system routes protected

- `app/api/cron/beta-reminders/route.ts`
- `app/api/cron/daily-admin-digest/route.ts`
- `app/api/cron/nightly-photo-backfill/route.ts`
- `app/api/admin/health-intelligence/import/route.ts`

### Import/backfill/enrichment/cleanup/dedupe routes protected

- Manual Google specialty import now requires superadmin unless called with trusted internal/cron secret.
- Health-intelligence import now requires trusted cron or superadmin.
- Nightly photo backfill now requires trusted cron and requires a configured internal import secret for downstream privileged route calls.
- Location photo diagnostics and publishability repair now require superadmin before service-role access.
- Existing location-growth/import/dedupe/publish/enrichment routes were reviewed against the existing `requireAdminApiRole` pattern; remaining broad role allowances are listed under remaining risks.

### Superadmin-only actions confirmed

- User detail/mutation/delete/disable/password reset API routes changed in this pass require superadmin.
- Service-role data repair route changed in this pass requires superadmin.
- Manual health import and manual Google specialty import require superadmin unless using trusted cron/internal secret.
- Cron routes require `CRON_SECRET` and no longer accept query-string secrets.

### Commands run

- `find .. -name AGENTS.md -print`
- `cat AGENTS.md`
- `cat package.json`
- `sed -n '1,140p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `rg "SERVICE_ROLE|service_role|createServiceRole|SUPABASE_SERVICE_ROLE|service role|supabaseAdmin" app lib scripts supabase -n || true`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

### Remaining risky routes

- Some admin API routes still rely on page-oriented helpers or domain-specific helper wrappers and should receive dedicated negative auth tests in the next security pass.
- Some location-growth operations still allow non-superadmin admin roles through existing permission groups; this may be intentional for operational teams, but destructive publish/dedupe/enrichment/data-repair actions should be reviewed endpoint-by-endpoint against the superadmin-only policy.
- `/api/debug/**` still ships in the production route manifest and should be gated or disabled in a dedicated debug-route hardening pass.
- Owner/business routes that use service-role reads were out of scope for this combined Phase 3/5 pass and should be handled in the owner/business access-control phase.

### Remaining risks

- This was source-level hardening only; production Supabase RLS policies, storage policies, grants, RPC availability, and applied migration state were not verified against the live database.
- Lint still passes with existing warnings; the warning count remains high and should be reduced outside strict security repair mode.
- The route inventory is large, and aliases/re-exported routes should receive automated unauthenticated/authenticated-non-admin regression tests.

### Whether Supabase db push is needed

- No. This pass changed application code and documentation only. No Supabase migrations were added or modified, so `supabase db push` is not required for these changes.
