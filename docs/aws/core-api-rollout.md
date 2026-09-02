# TheOutHaven Core API rollout

The Core API moves transactional platform data access out of the Vercel application runtime while preserving Next.js routes as the authenticated browser-facing BFF.

## First extracted operation

`GET /api/admin/crm/context` remains the public application route and still performs `requireAdminRole(ADMIN_PAGE_ACCESS.crm)` in Next.js.

After authorization, the route sends only the parsed CRM record context to the HMAC-authenticated AWS Core API. AWS resolves CRM relationships and labels through Supabase REST using the service-role secret already stored in AWS Secrets Manager.

No raw PostgreSQL connection is opened by the Core API.

## Rollout safety

- Existing Next.js route URL does not change.
- Admin authorization remains in the web/BFF layer.
- Core API accepts only explicit operations; there is no generic table/query proxy.
- During rollout, a Core API failure falls back to the previous local Supabase implementation.
- Production Core API is pinned to the Virginia Supabase project.
- Virginia `pg_cron` remains untouched.

## Production activation

The `AWS core API` workflow deploys and smoke-tests the Core API, verifies a real read against Virginia Supabase, resolves the already-deployed Integration API endpoint, and then upserts both server-only Vercel production variables:

- `AWS_PLATFORM_CORE_API_URL`
- `AWS_PLATFORM_INTEGRATION_API_URL`

The application uses the existing `AWS_PLATFORM_JOB_GATEWAY_SECRET` as the initial HMAC fallback unless dedicated Core/Integration API secrets are configured. The workflow then forces one Vercel production redeploy and waits for it to reach `READY`.

## Next Core API migrations

After the CRM context pilot is healthy, migrate read-heavy CRM customer/contact/account list and settings endpoints next. Reservation writes, subscription mutations, checkout, and other transaction-critical write paths should move only after the read paths have production telemetry and rollback confidence.
