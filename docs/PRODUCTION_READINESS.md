# TheOutHaven Production Readiness Checklist

Use this checklist before every production deploy. Mark each item with the date, owner, and evidence link when possible (build log, Playwright trace, Supabase policy query, Lighthouse report, or screenshot).

## Public routes

- [ ] `/` loads with production content and no broken assets.
- [ ] `/explore` loads with searchable places or a clear empty state.
- [ ] `/create` loads the outing builder and primary search input.
- [ ] `/business` loads the business marketing page.
- [ ] `/business/claim` loads the public claim entry point.
- [ ] `/signup` loads the auth UI without duplicate or broken signup routing.
- [ ] `/admin/dashboard` resolves to the dashboard for admins or a clean auth redirect for signed-out users.
- [ ] Critical route health smoke tests pass in Playwright.

## Search

- [ ] Explore search accepts natural-language queries and updates without a full page reload.
- [ ] Create search accepts outing queries and returns cards or a helpful empty state.
- [ ] Search failures show a clean recovery message, not a crash or generic application error.
- [ ] Empty states include an obvious next action.
- [ ] Result cards link to valid detail pages.

## Auth

- [ ] Signup and login tabs/buttons are visible on `/signup`.
- [ ] Login form exposes forgot-password recovery.
- [ ] Signup form exposes create-account fields and terms requirements.
- [ ] Signed-out protected routes redirect cleanly to auth.
- [ ] Password policy and Turnstile behavior are verified in production-like env vars.

## Admin

- [ ] Admin dashboard resolves for admin accounts.
- [ ] Non-admin and signed-out users cannot access admin data.
- [ ] Admin location, claim, user, analytics, and support pages load without server errors.
- [ ] Admin actions emit audit/logging events where expected.

## Business claim flow

- [ ] Public claim page loads and explains claim requirements.
- [ ] Business owner claim submission succeeds with valid data.
- [ ] Duplicate/ineligible claims show clear messages.
- [ ] Admin claim review queue receives new claims.
- [ ] Approved claims grant the expected owner permissions.

## QR claim codes

- [ ] Admin QR code generation page loads.
- [ ] QR claim code resolves to the intended claim flow.
- [ ] Expired or invalid QR codes show safe, clear errors.
- [ ] QR scans do not expose private business or user data.

## Location owner dashboard

- [ ] Owner dashboard loads for claimed-location owners.
- [ ] Owners only see locations they own.
- [ ] Reservation, analytics, review, and marketing panels load or show clean empty states.
- [ ] Owner edit actions validate input and preserve location visibility rules.

## Analytics

- [ ] Client-side route and interaction tracking does not block core UX.
- [ ] Business analytics dashboards load with real data or clean empty states.
- [ ] Admin analytics pages avoid exposing data to unauthorized users.
- [ ] Event ingestion failures are logged without crashing public pages.

## Supabase/RLS/security

- [ ] Required production Supabase env vars are present.
- [ ] RLS policies are enabled on user, owner, claim, admin, reservation, and analytics tables.
- [ ] Anonymous users cannot read or mutate private records.
- [ ] Service-role code only runs server-side.
- [ ] Rate limits and abuse protections are enabled on public mutation/search endpoints.
- [ ] Secrets are not logged in build, runtime, or Playwright output.

## SEO

- [ ] Public pages have production metadata titles/descriptions.
- [ ] `robots.txt` and sitemap routes resolve.
- [ ] Noindex is applied to auth/admin/private pages.
- [ ] Canonicals and Open Graph images are valid for public marketing and location pages.

## Performance

- [ ] Production build completes successfully.
- [ ] Critical public routes render within acceptable TTFB/LCP budgets.
- [ ] Search requests stay within target latency or show loading states.
- [ ] Images use optimized sizing/fallback behavior.
- [ ] Bundle growth is reviewed before deploy.

## Deployment

- [ ] `npm run production-check` passes or all failures are explicitly triaged.
- [ ] Required environment variables exist in the deployment target.
- [ ] Database migrations/policies are applied before app deploy.
- [ ] Rollback plan is documented for the release.
- [ ] Post-deploy smoke tests are run against the production URL.
