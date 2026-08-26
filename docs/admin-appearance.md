# Admin appearance

Authenticated `/admin/**` pages share one appearance system from `app/admin/layout.tsx`.

## Modes

- `auto` (default): light between 07:00 and 19:00 local browser time; dark otherwise.
- `light`: always light.
- `dark`: always dark.

Admins can change the mode and automatic transition times from `/admin/dashboard/settings`. The preference is stored on the current browser/device under `theouthaven.admin.appearance.v1`.

## Theme contract

New admin UI should prefer the existing admin tokens/classes (`--admin-*`, `admin-page`, `admin-card`, `admin-panel`, `admin-field`, `admin-primary`, `admin-secondary`) instead of adding new hard-coded black/white surfaces.

Compatibility styles under `app/admin/admin-appearance*.css` keep legacy admin pages readable while older hard-coded Tailwind dark utilities are gradually migrated to the shared tokens.

Public admin login/unauthorized pages intentionally stay outside the authenticated appearance provider.
