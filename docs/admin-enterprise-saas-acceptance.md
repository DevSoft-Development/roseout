# Enterprise Admin E2E Acceptance Matrix

This checklist defines the minimum evidence required before the enterprise admin migration can be marked complete.

## Phase 1 — Unified shell
- Every admin page renders inside one shell.
- Sidebar groups match Command, Locations, Reserve, Growth, People, and Platform.
- Command bar, breadcrumbs, page header, alerts, tasks, and account menu are keyboard accessible.
- Active-route state works for nested and dynamic routes.

## Phase 2 — Design system
- Shared cards, tables, forms, filters, drawers, empty states, and status badges are used instead of page-local copies.
- Focus, hover, disabled, loading, error, and empty states are verified.
- TheOutHaven black/charcoal/rose tokens are used consistently.

## Phase 3 — Location Workspace
- The eight canonical tabs are Overview, Profile, Menu, Operations, Growth, Communication, Activity, and Settings.
- Legacy CRM tabs resolve to the correct canonical workspace.
- Existing location edit, claim, reservation, analytics, marketing, support, and billing actions remain functional.

## Phase 4 — Menu migration
- `/admin/dashboard/locations/[id]/menu` is stable.
- Menu editor supports items, categories, packages, modifiers, availability, photos, import, AI assistance, and public preview.
- Admin editing does not require owner impersonation.
- Save, validation, permission, and optimistic-state failures are visible and recoverable.

## Phase 5 — Shared intelligence
- Tasks, notifications, timeline events, and global search use shared contracts.
- Every result respects role and location scope.
- Navigation failures and unavailable records have clear recovery actions.

## Phase 6 — Module migration
- Reserve, Growth, Claims, Careers, and Platform use the unified shell and design system.
- No module introduces a competing sidebar, header, card system, or status vocabulary.

## Phase 7 — Cleanup
- Duplicate shells, dead routes, backup pages, unused helpers, and obsolete styles are removed only after redirects and usage checks exist.
- No public or bookmarked admin link becomes a hard 404.

## Phase 8 — Permissions and QA
- Superadmin, admin, editor, reviewer, viewer, ambassador, and experience-team access is tested.
- Mobile widths, Safari, Chrome, keyboard navigation, landmarks, labels, contrast, and focus order are verified.
- Unit, integration, Playwright, typecheck, lint, and production build pass.

## Phase 9 — Soft launch
- Navigation errors, route 404s, failed actions, permission denials, task completion, and page performance are monitored.
- Rollback keeps the legacy CRM detail route available until canonical workspace adoption is proven.
- The migration is marked complete only after production evidence shows no critical regression.
