# Production owner, CRM workspace, and reservation access-control audit

## Owner/business routes inspected
- `app/business/dashboard/layout.tsx`, analytics, billing, and promotions pages.
- `app/locations/dashboard/page.tsx`, owner edit pages, and edit-context API.
- `app/api/owner/restaurant/update/route.ts` and `app/api/owner/activity/update/route.ts` now use the authenticated Supabase user and centralized owner/admin location access.
- `app/api/business/analytics/route.ts` now scopes analytics and outings to the authorized location and avoids returning user IDs.
- `app/api/business/billing/change-plan/route.ts` now rejects direct Pro activation and requires Stripe/admin confirmation for upgrades.

## Reservation routes inspected
- Portal layout/resources/assign-resource/reservations/update endpoints were reviewed for owner/admin `locationId` trust boundaries.
- `app/api/reserve/portal/reservations/update/route.ts` now requires owner/admin access for non-admin updates and keeps `.eq("location_id", authorizedLocationId)` on reservation mutation.

## CRM workspace routes inspected
- `/admin/dashboard/crm/**` is the workspace source of truth.
- CRM shell, index, queues, operations/outreach redirects, and detail page were reviewed.
- CRM detail access now checks broad admin/manager access or explicit workspace assignment before loading related private CRM data.

## Legacy workspace redirects verified
- `app/my-workspace/**` and `app/admin/dashboard/my-workspace/**` are legacy redirect-only surfaces and should continue to point at protected `/admin/dashboard/crm/**` destinations.

## Files changed
- `lib/team-tools.ts`
- `lib/workspace-dashboard-data.ts`
- `lib/auth/locationOwnerAccess.ts`
- `lib/admin-crm.ts`
- `app/admin/dashboard/crm/page.tsx`
- `app/admin/dashboard/crm/[id]/page.tsx`
- `app/api/owner/restaurant/update/route.ts`
- `app/api/owner/activity/update/route.ts`
- `app/api/business/analytics/route.ts`
- `app/api/business/billing/change-plan/route.ts`
- `app/api/reserve/portal/reservations/update/route.ts`

## Access-control rules enforced
- Regular CRM workspace users fail closed when they have no direct `assigned_location_ids` or active `team_location_assignments` rows.
- Only explicit broad CRM roles (`superadmin`, `admin`, `manager`) can browse global CRM location lists.
- Owner/business access uses authenticated server-side user identity, approved owner mappings/claims/direct ownership, and canonical/source IDs.
- Reservation owner mutations must be scoped to the authorized location.

## Intentionally public endpoints
- No claim-code verification endpoint was changed in this phase. Public claim verification, if present, remains intentionally public and should only reveal minimal claim state.

## Intentionally admin-only endpoints
- Admin billing/plan changes, destructive CRM settings, admin impersonation, and broad CRM/global analytics remain admin-only through existing admin helpers.

## Remaining manual-review items
- Complete parity hardening for every reservation portal resource/layout mutation handler beyond the reservation status update route.
- Review all CRM queue components for any UI-only all-location assumptions; shared helper behavior now fails closed for regular users.
- Verify Stripe webhook/subscription confirmation path is the only path that activates Pro.

## Known risks
- Some legacy deployments may not have `team_location_assignments`; regular workspace users without direct assignments will now see no locations by design.
- The CRM list page filters rows after the existing fallback fetch for scoped users; if a scoped user has more assigned rows than the first fetched page contains, pagination may require follow-up optimization.
