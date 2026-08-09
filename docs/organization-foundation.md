# Organization Foundation

## Purpose

This phase adds a canonical organization identity layer without changing current production ownership, login, billing, reservation, CRM, or location authorization behavior.

An organization is a business/entity container that can later own or manage locations, publish events, hold customer relationships, manage team members, and participate in ticketing or payouts. A user may belong to multiple organizations while remaining a normal consumer user.

## Canonical foundation tables

- `organizations` — business/entity identity.
- `organization_members` — business-facing organization membership. This is intentionally separate from TheOutHaven internal `team_member_profiles` and `team_location_assignments`.
- `organization_locations` — organization-to-location relationships.
- `organization_migration_links` — server-only evidence that records why a legacy claim/ownership record was associated with an organization-domain record.
- `organization_audit_logs` — append-only organization-domain mutation audit.

## Existing systems intentionally retained

This phase does not replace or delete:

- `business_claims`
- `location_owner_locations`
- direct `locations.owner_user_id` ownership compatibility
- `location_team_members`
- `team_member_profiles`
- `team_location_assignments`
- business dashboard routing
- current login destination logic
- reservations
- billing / Stripe subscription ownership
- internal CRM

Existing location authorization remains the production source of truth until a separately reviewed compatibility/cutover phase.

## Authorization

Browser/Data API access is read-only in this phase.

Authenticated users may read:

- organizations where they have an active membership;
- their own membership rows;
- linked organization locations for organizations where they are active members;
- organization audit history for organizations where they are active members.

Privileged internal admins (`superadmin`, `admin`, `manager`) retain broad read access for operations.

There are deliberately no authenticated browser INSERT/UPDATE/DELETE policies for the organization foundation tables. Mutations use server-only helpers and explicit organization authorization.

`organization_migration_links` is server-only and has no authenticated/anonymous Data API privileges.

## Server helpers

`lib/organizations/access.ts`

- `getOrganizationAccess`
- `requireOrganizationView`
- `requireOrganizationOperate`
- `requireOrganizationManage`

`lib/organizations/queries.ts`

- `getUserOrganizations`
- `getOrganization`
- `getOrganizationLocations`
- `getOrganizationMembers`

`lib/organizations/service.ts`

- `createOrganization`
- `addOrganizationMember`
- `updateOrganizationMemberRole`
- `linkLocationToOrganization`
- `recordOrganizationMigrationEvidence`

Organization creation creates the requested organization plus an active owner membership and an audit record. If membership/audit creation fails, the helper compensates by removing the partial organization record.

Member role changes prevent demoting the last active owner.

Location linking requires organization management access and does not mutate the legacy location owner/claim records.

## Migration/backfill policy

No automatic legacy backfill runs in this phase.

Do not assume multiple locations with the same `owner_user_id` belong to one organization. That is insufficient evidence and could incorrectly merge unrelated businesses.

A later compatibility phase may bootstrap organization candidates from approved claims/owners, but every generated relationship should record migration evidence including:

- source table;
- source record ID;
- target entity;
- strategy;
- confidence;
- migration version;
- optional metadata.

Low-confidence grouping must require review rather than silently merging businesses.

## Organization roles

Foundation roles are intentionally small:

- `owner`
- `admin`
- `manager`
- `member`
- `view_only`

Do not add event-scanner, finance, analytics, or ticketing-specific organization roles in this phase. Those should be permissions/resource scopes when those domains are implemented.

## Verification model

`organizations.verification_status` and `trust_level` are organization trust attributes only. They do not replace:

- account/email verification;
- location claim verification;
- future organizer publishing trust;
- future Stripe/KYC payout eligibility.

Do not collapse these trust layers into one `verified` flag.

## Validation before deployment

After applying the migration in a linked/staging Supabase environment, verify at minimum:

1. RLS is enabled on all five new tables.
2. Anonymous users cannot read any new table.
3. Authenticated user A cannot read organization B without membership.
4. An active organization member can read their organization and linked locations.
5. A regular member cannot use server helpers requiring management access.
6. Owners/admins can add members and link locations through trusted server code.
7. The final active owner cannot be demoted.
8. `organization_migration_links` cannot be read through the authenticated Data API.
9. Existing business claim, owner-location, location-team, reservation, CRM, and business-dashboard flows remain unchanged.
10. No organization creation/backfill occurs automatically merely because the migration was applied.

## Next phase

The next phase should be Organization Compatibility, not Events yet. It should bridge existing approved claims, owner mappings, location team access, and business dashboard context to organizations while maintaining safe fallback to the legacy ownership model.
