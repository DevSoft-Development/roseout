# TheOutHaven Enterprise Admin Transformation

Status: implementation contract for the unified admin migration.

## Product direction

The admin should operate as one connected enterprise SaaS workspace inspired by the operational clarity of Resy and OpenTable while retaining TheOutHaven's black, charcoal, white, and rose-red visual identity.

CRM owns the business relationship. The Location Workspace owns the location record and all location-level operations.

## Canonical navigation

### Command
- Dashboard
- My Workspace
- Inbox
- Tasks

### Locations
- Location Directory
- CRM
- Claims
- Data Quality
- Location Tools
- Imports & Enrichment

### Reserve
- Live Operations
- Reservations
- Waitlist
- Walk-ins
- Floor Plans
- Reserve Analytics

### Growth
- Marketing Studio
- Analytics
- Reviews
- Search Health
- Offers
- VIP
- Event Leads
- QR Growth Tools

### People
- Users
- Team
- Careers
- Support
- Beta Program
- Giveaway
- Knowledge Base

### Platform
- Production
- Deployments
- Cron Jobs
- Logs
- Billing
- Permissions
- Settings

## Canonical Location Workspace

Each location has eight primary tabs:

1. Overview
2. Profile
3. Menu
4. Operations
5. Growth
6. Communication
7. Activity
8. Settings

Canonical routes:

- `/admin/dashboard/locations/[id]`
- `/admin/dashboard/locations/[id]/profile`
- `/admin/dashboard/locations/[id]/menu`
- `/admin/dashboard/locations/[id]/operations`
- `/admin/dashboard/locations/[id]/growth`
- `/admin/dashboard/locations/[id]/communication`
- `/admin/dashboard/locations/[id]/activity`
- `/admin/dashboard/locations/[id]/settings`

Existing `/admin/dashboard/crm/[id]` behavior stays available during migration and redirects only after parity is verified.

## Phase 1: Unified shell

Scope:
- Shared sidebar configuration.
- Command bar with global search, create actions, tasks, alerts, and user menu.
- Breadcrumbs generated from route metadata.
- Shared page header with title, subtitle, status, and actions.
- Responsive mobile navigation.
- Stable focus management during navigation.

Acceptance:
- Every admin page uses one shell.
- No nested page introduces a second sidebar or command bar.
- Current page and parent section are visibly identified.
- Keyboard navigation works through sidebar and command actions.
- Mobile layout has no horizontal page overflow.

## Phase 2: Design system

Scope:
- Extend the existing `AdminDesignSystem` instead of replacing it.
- Shared cards, metrics, data tables, filters, drawers, dialogs, forms, tabs, badges, skeletons, empty states, and errors.
- Canonical status tones and labels.
- Shared spacing, border, radius, typography, and interaction tokens.

Acceptance:
- Feature pages do not define one-off badge or button systems.
- Tables share pagination, filtering, sorting, selection, and responsive behavior.
- Form validation and save feedback are consistent.
- Focus rings, labels, and semantic controls pass accessibility review.

## Phase 3: Location Workspace

Move existing CRM detail functionality into the eight canonical tabs without removing working behavior.

Overview includes health, publishability, claim and owner status, plan, billing, reservations, revenue, views, clicks, reviews, tasks, menu status, Reserve status, marketing status, AI recommendations, and recent activity.

Profile includes Profile Basics, Search & Matching, address, market, categories, cuisine, experiences, amenities, offerings, hours, photos, branding, SEO, public preview, and Generate with AI for eligible fields.

Operations includes reservations, waitlist, walk-ins, tables, booths, rooms, lanes, floor plans, staff assignments, claims, and support cases.

Growth includes analytics, Marketing Studio, reviews, offers, VIP, event leads, QR campaigns, SEO, and campaign performance.

Communication includes owner email and SMS, outreach templates, claim invitations, billing and reservation messages, internal notes, and communication history.

Activity includes profile, menu, owner, claim, reservation, marketing, visibility, and admin events.

Settings includes owner and team access, plan and billing, Reserve configuration, integrations, notifications, QR settings, visibility, publish controls, archive, and danger-zone actions.

Acceptance:
- Existing CRM detail capabilities are mapped before legacy sections are removed.
- A location header and status strip remain consistent across tabs.
- Tab URLs are directly addressable and browser navigation works.
- Permission failures explain the required role or access relationship.

## Phase 4: Menu migration

The Menu becomes a first-class location tab with its own route.

Subsections:
- Overview
- Items
- Categories
- Packages
- Modifiers
- Availability
- Photos
- Import
- AI Menu Assistant
- Public preview
- Settings

Items support name, description, price, category, photo, dietary tags, availability, featured state, sort order, and publish state.

Packages support prix fixe, birthdays, groups, bottle service, events, rooms, lanes, and VIP experiences.

Modifiers support add-ons, sides, sizes, flavors, temperatures, and upgrades.

AI safeguards:
- Generate and improve descriptions.
- Suggest categories and dietary tags.
- Identify duplicates and missing prices.
- Suggest package structure and missing photos.
- Never directly publish AI changes.
- Display field-level before-and-after previews.

Acceptance:
- Menu appears in primary location navigation.
- Import and manual editing use the same normalized model.
- Public preview matches publish state and availability.
- Packages support restaurant and activity locations.

## Phase 5: Shared intelligence

Scope:
- Global search across locations, owners, users, claims, reservations, tasks, jobs, and support records.
- Shared task service with assignment, due date, priority, entity links, status, and history.
- Notification center with read state and deep links.
- Unified entity activity timeline.
- Context-aware AI recommendations.

Acceptance:
- Search results obey role and location permissions.
- Every task and notification links to a valid destination.
- Timeline events use canonical event names and actor metadata.
- AI recommendations are deduplicated and dismissible.

## Phase 6: Module migration

Migrate Reserve, Growth, Claims, Careers, and Platform to the unified shell and design system.

Reserve uses a service-first hierarchy: live operations, reservations, waitlist, walk-ins, floor plans, and analytics.

Growth includes campaign creation, performance, reviews, offers, VIP, event leads, and QR tools.

Claims includes review queue, evidence, owner matching, communications, approval, and access provisioning.

Careers includes jobs, applications, interviews, offers, talent pool, and internships.

Platform includes production readiness, deployments, cron jobs, logs, billing, permissions, and settings.

Acceptance:
- Modules no longer create custom outer shells.
- Shared status, tables, forms, drawers, and empty states are used.
- Existing deep links resolve or redirect.

## Phase 7: Cleanup

Scope:
- Remove duplicate shells and route wrappers.
- Consolidate repeated UI helpers and status logic.
- Remove backup pages, unused components, dead routes, and stale feature flags.
- Add redirects for replaced admin URLs.

Guardrails:
- Confirm zero imports before deletion.
- Preserve data services until all consumers migrate.
- Record removals in the PR and route compatibility table.

## Phase 8: Permissions and QA

Scope:
- Route-level and action-level permission matrix.
- Superadmin, admin, editor, reviewer, viewer, ambassador, experience team, and location-owner coverage.
- Mobile and tablet verification.
- Accessibility review.
- Unit, integration, and Playwright coverage.
- Redirect and deep-link verification.

Required tests:
- Unauthorized roles fail closed.
- Authorized roles see only permitted data and actions.
- Tab navigation and browser back/forward work.
- Forms preserve unsaved-change warnings.
- Menu editing, import, AI preview, and public preview work end to end.
- Reserve operational pages load at desktop and mobile sizes.
- Global search does not leak restricted records.
- Legacy routes redirect without loops.

## Phase 9: Soft launch

Scope:
- Feature-flag rollout by role or user cohort.
- Capture navigation failures, route errors, permission denials, save failures, task completion, and search success.
- Monitor Core Web Vitals and route latency.
- Provide instant rollback to the legacy workspace while data models remain compatible.

Launch gates:
- No unresolved P0 permission or data-loss defects.
- Production build and typecheck pass.
- Critical admin E2E suite passes.
- Mobile navigation and key operational paths pass.
- Error and navigation dashboards are active.
- Redirect inventory is verified.
- Support and rollback runbooks are documented.

## Delivery strategy

Keep the program in draft/stacked migration until CI and preview validation pass. Implement shell and contracts first, then Location Workspace and Menu, then shared intelligence, module migrations, cleanup, permission hardening, and soft launch.

Do not mark the full nine-phase effort complete based only on route scaffolds or visuals. Each phase must satisfy its acceptance criteria and pass Vercel preview validation before merge.
