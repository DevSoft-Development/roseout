# Enterprise Admin Route Map

## Canonical location routes

- `/admin/dashboard/locations/[id]/overview`
- `/admin/dashboard/locations/[id]/profile`
- `/admin/dashboard/locations/[id]/menu`
- `/admin/dashboard/locations/[id]/operations`
- `/admin/dashboard/locations/[id]/growth`
- `/admin/dashboard/locations/[id]/communication`
- `/admin/dashboard/locations/[id]/activity`
- `/admin/dashboard/locations/[id]/settings`

## Compatibility mapping

- Overview → `?tab=overview`
- Profile → `?tab=profile`
- Menu → `?tab=menu-packages`
- Operations → `?tab=reservations`
- Growth → `?tab=marketing-studio`
- Communication → `?tab=communication`
- Activity → `?tab=logs`
- Settings → `?tab=settings`

The canonical URLs are the long-term public admin contract. Compatibility redirects are temporary migration infrastructure and should be removed only after the corresponding panels are rendered directly in the Location Workspace and production route telemetry confirms adoption.
