# Phase 1 — Production Stabilization

Status: in progress
Branch: `agent/production-stabilization-phase-1`

## Objective

Stabilize the existing product before soft launch. This phase does not add a new major product system. It closes currently reported launch blockers, validates existing workflows, and produces evidence that the current application is safe to pilot.

## Confirmed current blockers

The following items come from active project reports and current open work:

### Search

- Reproduce and fix mixed-intent searches such as `dinner near gaming center` returning no useful results.
- Add regression coverage for anchor-location + restaurant searches.
- Confirm restaurants and activities cannot be returned as the same location in a paired outing.
- Confirm normalized geo, anchor, primary domain, search type, and pairing diagnostics are recorded for failed searches.

### CRM location workspace

- Fix records showing `Missing photo` when `photo_status` reports `has_photo`.
- Remove the duplicate `Repair publishability for this location` action.
- Make unsupported-location-type messaging identify the actual source value and required correction.
- Ensure publishability status uses one canonical calculation for searchable, publish-ready, ready-to-approve, hidden, low-level, data quality, photo quality, and supported type.
- Ensure all editable Profile Basics and Search & Matching fields expose the existing Generate with AI workflow where supported.

### Location tools

- Fix bulk `Make searchable` in `/admin/dashboard/settings/location-tools/hidden-locations`.
- Add or verify a single-location `Make searchable` action using the same server-side mutation and validation.
- Prevent duplicate-review recommendations from changing restaurant records into activity records, or rooftop records into nightlife, without explicit evidence and review.

### Existing workflow validation

Validate these current flows without creating competing routes or duplicate systems:

1. Public search → results → location profile → reserve/call tracking.
2. Admin CRM location → edit profile → photos → search/matching → publishability.
3. Business owner → claim/access → edit profile → menu → reservations → analytics.
4. Admin hidden-location repair and duplicate-review tools.
5. Production command center launch-gate checks.

## Implementation order

### 1. Establish baseline

- Run typecheck, lint, production build, unit tests, enterprise-search tests, and focused E2E tests.
- Record failures in this PR before changing behavior.
- Confirm current Supabase migrations and generated database types are aligned.

### 2. Search regressions

- Add failing regression tests for the confirmed search examples.
- Fix intent, anchor, domain separation, pairing, or ranking only after a failing test identifies the responsible layer.
- Preserve existing public API response shape unless a migration plan is included.

### 3. CRM publishability consistency

- Trace all publishability labels and actions to their source helpers/API.
- Replace duplicate client-side decisions with one canonical server-side result.
- Add tests covering contradictory photo and quality states.

### 4. Location-tool mutations

- Reuse one mutation for bulk and single-item searchable repairs.
- Return per-record success/failure details.
- Refresh affected rows after mutation and surface errors instead of silently doing nothing.

### 5. End-to-end launch evidence

- Run focused browser tests for the repaired workflows.
- Add screenshots/log output only when useful for review.
- Update the production command center with verified evidence rather than manually marking untested gates passed.

## Acceptance criteria

This phase is complete only when:

- Typecheck passes.
- Production build passes.
- No new lint errors are introduced.
- Enterprise-search regression tests pass.
- The confirmed mixed-intent/anchor search cases return the correct domain and usable results.
- CRM no longer shows contradictory photo/publishability labels.
- Only one publishability repair action is rendered.
- Bulk and single hidden-location repair actions work and report results.
- Duplicate review does not silently change the primary location domain.
- Focused E2E tests cover the repaired workflows.
- The PR includes exact validation commands and results.

## Guardrails

- Do not create a second CRM, search, menu, reservations, claims, or production-readiness system.
- Do not mark launch checks passed without executable evidence.
- Do not use service-role access in browser code.
- Do not modify live production records during automated tests unless the test is explicitly isolated to demo/test data.
- Do not merge placeholder patches or documentation-only claims as completed fixes.
