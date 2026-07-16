# Production Integrity Verification

This branch implements one repeatable production-readiness verification flow from current `main`.

## Migration verification

- Compare every local Supabase migration on `main` with `supabase_migrations.schema_migrations` in production.
- Report missing, failed, duplicate, or out-of-order migrations.
- Verify the searchable-state enforcement trigger and its backing function exist and are enabled.
- Verify the cross-type duplicate protection trigger/function exists and is enabled.

## Data-integrity assertions

The verification must fail when any of these conditions are found:

- Hidden locations with `is_searchable = true`.
- Low-level locations with `is_searchable = true`.
- Deleted, suppressed, terminal-status, demo/training, low-quality, or coordinate-invalid locations with `is_searchable = true`.
- Pending duplicate recommendations that prefer an `activity` or `nightlife` record over a matching `restaurant` record.
- Previously merged restaurant records whose canonical `location_type` is no longer `restaurant`.

Each assertion must return a count, representative record IDs, the SQL or check used, and a repair link or command when blocked.

## Critical user journeys

Add repeatable desktop and mobile checks for:

- Guest search.
- Registered-user search.
- Restaurant-only search.
- Activity-only search.
- Restaurant plus activity pairing.
- Anchor-location search.
- Business claim flow.
- Owner dashboard access.
- Admin location editing.
- Reservation creation and persistence.
- Waitlist creation and persistence.
- Walk-in creation and persistence.
- Beta weekly submission and completion-email proof.
- Stripe checkout in test mode.

Tests that create records must use clearly identified test data and clean it up safely. Live email and Stripe checks must use non-production recipients and Stripe test mode.

## Production commands

Run and capture evidence for:

- Typecheck.
- Lint.
- Unit and integration tests.
- Production build.
- Playwright desktop smoke tests.
- Playwright mobile smoke tests.

## Production Command Center integration

Write results to `/admin/dashboard/production` with:

- Pass, fail, blocked, or needs-review status.
- Exact evidence and failing assertion.
- Deployment URL.
- Current Git commit SHA.
- Latest local and production migration versions.
- Verification timestamp.
- Blocking issue link.
- Repair PR, route, command, or admin link.

The overall launch gate must remain blocked while a required migration, integrity assertion, critical journey, or production command is failing.

## Safety requirements

- Start from current `main` and do not depend on the old stacked production-readiness branches.
- Keep database checks read-only unless a separately approved repair action is explicitly run.
- Protect all verification endpoints with superadmin/admin authorization.
- Never expose service-role credentials or raw secrets in the UI, logs, or test artifacts.
- Do not charge a real payment method or email real customers during verification.
