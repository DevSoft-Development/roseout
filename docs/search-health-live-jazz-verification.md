# Verification

Open `/admin/dashboard/search-health?tab=searches` and locate the exact live query.

Expected behavior:

- Type displays as mixed outing.
- Status displays as Issue when activity count is zero.
- Issue displays `missing_required_activity` when no stored issue label exists.
- Copy diagnostics is visible.
- Mark incorrect result is visible.
- Replay and Lab remain available.
