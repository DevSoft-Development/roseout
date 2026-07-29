# Search Profile Rollout Admin Controls

The Admin Settings page exposes the effective Search Profile retrieval rollout stored under `app_settings.key = search_profile_rollout`.

Controls:

- `off`: legacy retrieval only
- `shadow`: legacy served, canonical profile retrieval compared in the background
- `canary`: canonical retrieval served to a stable percentage of requests
- `primary`: canonical retrieval authoritative with bounded domain-specific legacy fallback
- emergency kill switch: forces effective mode to `off` while preserving the configured mode

Environment variables remain the fallback when no database setting exists:

- `SEARCH_PROFILE_MODE`
- `SEARCH_PROFILE_CANARY_PERCENT`

Every change is written to `admin_audit_logs`, invalidates the 30-second configuration cache, and is applied by the retrieval pipeline on subsequent requests.
