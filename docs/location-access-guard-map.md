# Location access guard map

This document maps the current location-access guard surface before replacing duplicated permission checks. It exists so the next implementation PR can be small, testable, and avoid breaking demo/admin location workflows again.

## Current canonical helper

`lib/auth/locationOwnerAccess.ts` is the broadest access helper and should be treated as the canonical direction for business/location tools.

Important exported concepts:

- `LocationPermission`: location, menu, marketing, recommendation, and photo permission keys.
- `LocationAccessSource`: `superadmin`, `admin`, `owner`, `location_admin`, `view_only`, `demo`, `public`, `none`.
- `resolveLocationAccessContext()`: resolves the current user, canonical location, demo/admin context, owner access, team access, and final permissions.
- `requireLocationPermission()`: wrapper for route handlers that need a specific `LocationPermission`.
- `resolveEditableLocationContext()`: editable context wrapper that enables demo/admin preview support.

Existing behavior to preserve:

- Admins can view supported locations.
- Admin edit access is role-gated through `adminCanEdit`.
- Demo preview is allowed only when `allowDemoPreview` and demo/fromDemoCenter flags are present.
- Canonical lookup must tolerate optional/missing source columns by checking safe columns separately.
- Owners can match by canonical location id or source id.
- Team members can be `location_admin` or `view_only` with custom permission overrides.

## Separate Reserve helper

`lib/reserve/locationPermissions.ts` is currently a separate permission engine for Reserve.

Important differences:

- Uses `ReservePermissionKey` values like `manageReservations`, `manageLayout`, `manageHours`, `manageQrCodes`, `manageTeam`.
- Uses `getOptionalCurrentAdmin()` from `lib/admin/admin-access.ts` instead of `resolveLocationAccessContext()`.
- Checks owner fields directly on `locations`.
- Reads `location_team_members` directly and maps Reserve roles locally.
- Returns Reserve-specific permission objects rather than shared `LocationPermission[]`.

This helper should not be removed in one step. It should be adapted in a later PR so Reserve calls the canonical context first, then maps it into Reserve-specific permissions.

## Known duplicated/fragmented access surfaces

Search terms that returned access/error call sites:

- `You do not have access to this location`
- `You do not have permission to access this location`
- `You do not have permission to manage this location`
- `requireOwnerAccessToLocation`
- `requireOwnerOrAdminAccessToLocation`
- `requireLocationPermission`
- `resolveEditableLocationContext`
- `getReserveLocationAccess`
- `requireReservePermission`
- `admin_location`

High-risk areas that should migrate gradually:

- `app/api/business/menu/route.ts`
- `app/api/business/marketing/generate/route.ts`
- `app/api/business/marketing/suggestions/route.ts`
- `app/api/business/notifications/route.ts`
- `app/api/locations/optimize/route.ts`
- `app/api/reserve/portal/*`
- `components/admin/LocationProfileEditor.tsx`
- `app/admin/dashboard/locations/[type]/[locationId]/page.tsx`
- `app/reserve/location/[locationId]/page.tsx`
- `app/locations/dashboard/*`

## Recommended PR sequence

### PR 934: add route-level guard tests for existing behavior

Add focused tests around access helpers before changing routes.

Test cases:

1. Superadmin can view and edit a canonical location.
2. Admin with edit role can edit.
3. Admin with view-only role can view but not edit.
4. Owner can view and edit claimed/owned location.
5. Location team `location_admin` can edit.
6. Location team `view_only` can view but not edit.
7. Demo center admin preview can edit when `allowDemoPreview` and demo flags are present.
8. Unknown/unauthenticated user is denied.
9. Missing location id returns a friendly 400 response.
10. Missing/optional source columns do not break canonical lookup.

### PR 935: migrate one low-risk business API to `requireLocationPermission()`

Start with one route only, preferably `app/api/business/menu/route.ts` or a marketing route.

Rules:

- Do not change schema.
- Do not change response shape except for using shared access error responses.
- Keep demo/admin context query params intact.
- Verify with build and the new tests.

### PR 936: migrate remaining business menu/marketing/photo access routes

Only after PR 935 proves the pattern.

### PR 937: bridge Reserve permissions to canonical location context

Do not delete Reserve role mapping. Instead, call `resolveLocationAccessContext()` first and map the result into the existing Reserve permission shape.

Preserve Reserve-specific permission keys:

- `viewDashboard`
- `manageReservations`
- `manageLayout`
- `manageHours`
- `manageReminders`
- `manageQrCodes`
- `editProfile`
- `viewAnalytics`
- `manageBilling`
- `manageTeam`

## Acceptance criteria for the full cleanup

- Business menu, marketing, recommendations, photos, Reserve portal, and location editor all use one canonical location-access context.
- Demo Center and admin-location support mode work for ownerless demo locations.
- Owners and claimed businesses still work.
- View-only team users cannot edit.
- Location admins/managers can edit only what their role allows.
- The user-facing errors are consistent and friendly.
- No route invents a separate admin/owner/team check unless there is a documented reason.

## What not to do

- Do not replace every route in one PR.
- Do not change RLS policies in the same PR as route guard cleanup.
- Do not invent tables or columns.
- Do not remove Reserve permission keys until the Reserve UI has been updated to use shared permissions.
- Do not remove demo/admin query params while migrating access checks.
