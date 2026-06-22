# Production Hardening Audit

Date: 2026-06-22

## Executive summary

This was an audit-only pass. No application code was changed. The app currently passes `npm run typecheck`, `npm run lint`, and `npm run build`, so there are no immediate compile blockers from the checked commands. The highest launch risk is not build stability; it is production security and operational hardening around privileged routes, cron/import endpoints, service-role database access, and legacy duplicated location surfaces.

Key observations:

- Build/type/lint are green, but lint reports 1,839 warnings, including React purity/effect warnings and broad `any` usage.
- `npm audit --audit-level=high` could not complete because the npm audit endpoint returned 403 Forbidden, so dependency vulnerability status is unknown.
- Several admin routes are implemented as route aliases or bespoke helpers, which makes protection difficult to verify consistently.
- At least one admin debug endpoint (`/api/admin/location-growth/photo-debug`) directly reads service-role location/photo diagnostic data without an apparent auth guard in the route file.
- Cron endpoints have inconsistent protection behavior; some allow query-string secrets, and `nightly-photo-backfill` only denies when `CRON_SECRET` is configured.
- Business/owner dashboards use service-role reads with route-level ownership checks; these need dedicated abuse, negative-access, and schema-drift tests before launch.
- Migrations are numerous and include disabled/pending SQL files outside `supabase/migrations`; production schema state must be verified directly against Supabase before launch.
- Legacy `restaurants` / `activities` routes, pages, and table references remain significant, increasing schema drift and duplicated-flow risk.
- Search has substantial regression coverage, but public search/generate flows still depend on multiple route implementations, Edge fallback, health logging, and metadata sanitization; release should include strict search regressions and live smoke tests.

## Commands run and results

| Command | Result | Notes |
| --- | --- | --- |
| `pwd && find .. -name AGENTS.md -print && rg --files ...` | Pass | Confirmed repo root and scoped instructions. |
| `cat AGENTS.md && cat package.json` | Pass | Inspected project scripts/dependencies. |
| `npm run typecheck` | Pass | `tsc --noEmit` completed with exit code 0. |
| `npm run lint` | Pass with warnings | Exit code 0; ESLint reported 1,839 warnings and 0 errors. |
| `npm run build` | Pass | Next.js 16.2.4 production build completed successfully. |
| `npm audit --audit-level=high` | Warning / incomplete | Failed with `403 Forbidden - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`; vulnerability status unknown. |
| `rg --files app/api app/admin app/business app/dashboard app/location-owner ...` | Pass | Enumerated routes/pages for inspection. |
| `python` route-auth inventory script | Pass | Flagged route files without standard admin helper names and route files using service-role clients/secrets. |
| `find supabase -maxdepth 3 -type f` | Pass | Enumerated migrations, pending/disabled SQL, and Supabase functions. |
| `rg -n "restaurant|activity|restaurants|activities|..." ...` | Pass | Identified legacy restaurants/activities references. |

## Files/folders inspected

- `package.json`
- `AGENTS.md`
- `middleware.ts` / proxy output from build: build reports `ƒ Proxy (Middleware)`; no root `middleware.ts` was listed by `rg --files`.
- `app/api/**`
- `app/api/admin/**`
- `app/api/cron/**`
- `app/api/business/**`
- `app/api/owner/**`
- `app/api/location-owner/**`
- `app/admin/**`
- `app/admin/dashboard/**`
- `app/business/**`
- `app/dashboard/**`
- `app/location-owner/**`
- `components/**`
- `lib/**`
- `supabase/migrations/**`
- `supabase/functions/**` at a high level because lint and file inventory include them.
- `scripts/**`
- `tests/**`
- `docs/PRODUCTION_READINESS.md`
- `docs/PRODUCTION_CHECKS.md`
- Existing audit/checklist docs discovered under `docs/**`.

## High-risk security findings

1. **Unauthenticated-looking admin debug endpoint using service role.** `app/api/admin/location-growth/photo-debug/route.ts` uses `supabaseAdmin` and returns IDs, Google place IDs, image fields, photo flags, and photo errors from `locations`, but the route file has no visible `requireAdminApiRole`/`requireAdminRole` call.
2. **Admin route protection is inconsistent and hard to audit mechanically.** Many admin routes use `requireAdminApiRole`, but others use server-component redirects (`requireAdminRole`), aliases, or custom helpers. Aliases can be safe, but they make route-level policy review brittle.
3. **Cron endpoints allow query-string secrets.** `beta-reminders` and `daily-admin-digest` accept `?secret=...`, which risks leakage through logs, analytics, browser history, and proxies.
4. **Cron endpoint may fail open when a secret is missing.** `nightly-photo-backfill` denies only when not development and `CRON_SECRET` is set; in production with a missing secret, it proceeds.
5. **Internal import chain depends on fallback `IMPORT_SECRET || CRON_SECRET || ""`.** If both are missing, internal admin import calls are sent without the internal secret header, and downstream endpoint behavior determines exposure.
6. **Service-role use is broad.** Admin, business, owner, cron, support, reservations, marketing, analytics, and import routes use service-role reads/writes. That is sometimes necessary, but every route must have server-side auth, ownership, input validation, and audit logging.
7. **Fallback admin role lookup can mask schema drift.** `lib/admin-api-auth.ts` probes multiple legacy role tables/columns, which is useful for migration compatibility but increases the blast radius of stale role data if legacy tables are not cleaned up.
8. **Admin impersonation has multiple route names.** `/api/admin/impersonation/start` re-exports the POST handler from `/api/admin/impersonate`; this should be kept but tested explicitly to ensure both aliases enforce identical role and audit requirements.
9. **Debug routes under `/api/debug/**` exist in production build output.** These should be reviewed for production-only disablement or admin gating.
10. **Public-facing analytics/activity routes need rate limits and payload bounds.** Public tracking/search/feedback endpoints should be verified for abuse controls before launch.

## Build/type/lint findings

- `npm run typecheck` passed.
- `npm run lint` passed with warnings, not errors.
- ESLint warning count is high: 1,839 warnings. The major categories observed are `@typescript-eslint/no-explicit-any`, React hook purity warnings, set-state-in-effect warnings, and unused variables.
- Example React warning: `app/admin/dashboard/beta/page.tsx` calls `Date.now()` during render according to ESLint output.
- Example effect warning: `app/admin/claims/page.tsx` calls a state-updating fetch function directly inside `useEffect` according to ESLint output.
- `npm run build` passed with Next.js 16.2.4 and generated 257 static pages, plus many dynamic app/API routes.
- Build output confirms many legacy routes still ship, including `/api/restaurants`, `/restaurants/id/[id]`, `/restaurants/dashboard`, and `/restaurants/update`.

## Search findings

- Search has dedicated scripts: `test:search-production`, `test:search-quality`, `test:search-route-regression`, `test:enterprise-search`, `qa:search`, and several debug/regression scripts.
- The strict production check in `package.json` includes `typecheck`, `lint`, `build`, search production, search quality, and route regression scripts.
- Public create/generate uses `runEnterpriseSearch`, optional Edge create-search fallback, market guardrails, search health logging, usage limits, and metadata sanitization.
- Public explore search uses enterprise search with beta/debug metadata and a `betaDebug` branch that is true outside production or when `betaDebug=true` is present.
- Search health/admin endpoints exist and should be included in admin-gated route tests.
- Remaining risk is runtime schema drift: search depends on fields such as location image/photo flags, market/city/borough, search documents, food terms, pair scoring, and health-log tables that cannot be proven from source alone.

## Schema/migration findings

- `supabase/migrations/**` contains many migrations spanning auth profiles, analytics, QR codes, claim flows, search quality, location growth, admin CRM, beta testing, ML ranking, location profile source of truth, outing email plan flow, and cron monitoring.
- There are SQL files outside `supabase/migrations`, including `supabase/pending_migrations/**`, `supabase/disabled_migrations/**`, and several top-level SQL support files. These must be reconciled against production before launch.
- The code still contains fallback compatibility for legacy role tables and legacy location tables, indicating ongoing migration/state ambiguity.
- The audit did not connect to production Supabase, so actual applied migration state, RLS policy state, indexes, grants, RPC availability, triggers, and storage policies remain unknown.

## Admin/dashboard findings

- Admin pages are numerous and duplicated across `/admin/**`, `/admin/dashboard/**`, `/my-workspace/**`, and multiple CRM/business CRM areas.
- Admin page protection generally uses `requireAdminRole` in layouts/pages, and admin APIs often use `requireAdminApiRole`, but route-level consistency is not universal.
- Several admin API routes are aliases to other routes. This should be tested so aliases cannot bypass middleware, route-level logging, or future refactors.
- Admin operations with high blast radius include user creation/invites/password reset, impersonation, location growth publish/import/cleanup, marketing blasts, feature flags, admin search health, and support-ticket replies.
- Admin audit logging exists in `lib/admin-audit-log.ts`, but coverage is uneven by operation and should be mapped endpoint-by-endpoint.

## Owner/business access findings

- `app/api/business/analytics/route.ts` checks authenticated user ownership by `owner_user_id`, `owner_email`, or `claimed_by_email` before service-role analytics reads. This is a reasonable pattern but needs negative-access tests for each identity field and for forged `location_id`.
- `app/api/location-owner/analytics/route.ts` and `app/api/owner/**` use service-role access and should be verified for strict ownership checks and allowed-field updates only.
- Legacy owner routes (`/api/owner/restaurant/update`, `/api/owner/activity/update`) still exist alongside location-owner/business dashboards, increasing duplicated access-control risk.
- Business billing routes use service-role access and Stripe calls; they should be tested for plan/location ownership before launching paid flows.

## Public page/plan flow findings

- Production build lists required public pages: home, explore, create, business, business claim, login/signup, plan, pricing, location details, reservations, reserve pages, and public outing/confirmation/guest routes.
- `docs/PRODUCTION_READINESS.md` correctly states that build/lint/typecheck are not enough and that strict plus live production checks are required.
- `docs/PRODUCTION_CHECKS.md` distinguishes build-safe, release-safe, and live-site verified states.
- Email-my-outing / outing plan flow has a dedicated migration (`20260616170000_outing_email_plan_flow.sql`) and email template code, but runtime email delivery was not tested in this audit.
- Footer duplication remains a risk because both global layout/footer components and legacy public pages/routes coexist; visual E2E or screenshot checks are needed.

## Dependency audit findings

- `npm audit --audit-level=high` did not complete due to registry/audit endpoint 403.
- Dependency vulnerability status is therefore unknown and must remain a P0/P1 release gate until a successful audit can be run in an environment with npm audit access.
- Notable high-impact dependencies to keep current and verify: `next`, `react`, `@supabase/supabase-js`, `@supabase/ssr`, `openai`, `resend`, `twilio`, `@playwright/test`, and `eslint-config-next`.

## Prioritized repair plan

### P0 must fix before launch

1. Add/verify hard auth guards for every admin API route, especially `/api/admin/location-growth/photo-debug` and all import/growth/debug endpoints.
2. Change cron/import endpoints to fail closed when required secrets are missing in production.
3. Remove query-string secret support from cron endpoints or keep only during local development with explicit production denial.
4. Add route tests proving unauthenticated users get 401/403 for every `/api/admin/**`, `/api/cron/**`, owner/business private API, and debug API that exposes non-public data.
5. Reconcile production Supabase schema against `supabase/migrations/**`; document pending/disabled/top-level SQL status and apply required migrations.
6. Verify RLS policies, storage policies, RPC grants, and service-role-only tables in production Supabase.
7. Run a successful `npm audit --audit-level=high` and resolve any high/critical findings.
8. Run `npm run production-check:strict` successfully in a release-like environment.
9. Run live or preview E2E for auth, admin dashboard, public plan/search, claim, owner/business dashboard, reservation, and footer/link flows.
10. Review and gate `/api/debug/**` for production.

### P1 should fix before launch

1. Standardize admin API auth helpers and document allowed roles per endpoint.
2. Add consistent audit logging for high-blast-radius admin actions: impersonation, user creation, password reset, marketing sends, location publish/import/cleanup, feature flags, support replies, owner account changes.
3. Add input-size/rate-limit checks to public tracking/search/contact/feedback/claim endpoints.
4. Add negative ownership tests for business analytics, billing, owner updates, location-owner analytics, reservations portal, and claimed-location flows.
5. Reduce legacy `restaurants`/`activities` route/table dependencies or explicitly document them as compatibility surfaces with tests.
6. Add search route regression coverage for public create/explore and admin search lab parity using representative live-like fixtures.
7. Add email delivery smoke tests or provider sandbox checks for outing plan emails, claim emails, support emails, marketing emails, and beta reminders.
8. Add monitoring/alerts for cron failures, search no-results spikes, import failures, email failures, and schema-cache/missing-column errors.

### P2 cleanup after launch

1. Reduce lint warning count by replacing broad `any` types and resolving React hook warnings.
2. Consolidate duplicated CRM/location dashboard pages where possible without redesigning app flows.
3. Remove stale `.bak-*` files and legacy backup route text once confirmed unused.
4. Consolidate old footer/page layout duplication.
5. Improve docs so production readiness, admin API audits, search regression docs, and launch checklist point to one canonical release gate.
6. Add automated route inventory checks for unguarded admin/service-role endpoints.

## Recommended next phases

1. **P0 security patch phase:** Guard admin/debug/cron/import endpoints, fail closed on missing secrets, remove production query-string cron secrets, and add route-level negative auth tests.
2. **Supabase verification phase:** Compare production schema/RLS/storage/RPC state against migrations and document applied/pending SQL.
3. **Release-gate test phase:** Run `npm run production-check:strict`, successful `npm audit --audit-level=high`, preview E2E, and live smoke checks.
4. **Access-control regression phase:** Add owner/business/admin impersonation and private-data negative tests.
5. **Cleanup phase:** Reduce lint warnings, remove stale legacy/backup surfaces, and consolidate docs.

## Known unknowns

- Actual production Supabase schema, applied migration list, RLS policies, storage policies, triggers, RPCs, and grants were not verified.
- Environment variable presence and production secret values were not verified.
- Runtime behavior of email, SMS, Stripe, Google Places, OpenAI, and Supabase Edge functions was not tested.
- Live production URLs and preview URLs were not tested.
- Playwright E2E suites were not run in this audit phase.
- `npm audit` vulnerability status is unknown due to registry/audit endpoint 403.
- Admin route aliases may be safe if their target handlers are safe, but all aliases need explicit route tests.
- Some route inventory flags are heuristic and should be confirmed with endpoint-specific code review before changing behavior.
