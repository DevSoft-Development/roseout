# Enterprise Admin PR Notes

## Included in this foundation PR

- Canonical eight-tab Location Workspace contract.
- Stable `/admin/dashboard/locations/[id]/...` routes.
- Dedicated canonical Menu URL.
- Backward-compatible adapters to the existing CRM detail panels.
- Reusable TheOutHaven black/rose workspace navigation.
- Legacy-to-canonical route normalization tests.
- Nine-phase migration roadmap.
- E2E acceptance matrix covering permissions, accessibility, mobile, browser, build, and soft-launch monitoring.

## Why adapters are used first

The current CRM detail page owns many live systems and more than twenty tabs. Replacing every panel in one unvalidated connector-only change would create unnecessary risk. Canonical adapters establish permanent URLs immediately and preserve all existing functionality while each panel is extracted into the new workspace.

## Required validation before merge

```bash
npm run typecheck
npm run lint
npx vitest run lib/admin/__tests__/location-workspace.test.ts
npm run build
```

Then validate in the Vercel preview:

- Open each of the eight canonical location routes.
- Confirm every route resolves to the expected existing panel.
- Confirm Menu opens the admin menu editor and public preview remains available.
- Verify all supported admin roles and restricted location scopes.
- Verify mobile, Safari, Chrome, keyboard navigation, and visible focus states.

## Follow-on implementation

The roadmap intentionally keeps Phases 2–9 explicit. Each legacy panel should be moved behind the canonical routes without changing URL contracts, permissions, or business behavior. The legacy CRM route should remain available until production telemetry confirms safe adoption.
