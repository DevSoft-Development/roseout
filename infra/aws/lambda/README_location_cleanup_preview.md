# Location Intelligence cleanup preview

The AWS Location Intelligence API exposes a read-only cleanup preview endpoint:

- `POST /v1/cleanup/preview`
- HMAC-authenticated with the same Location Intelligence API secret
- `scope`: `publish_ready` (default) or `all_non_searchable`
- `limit`: 1-200 (default 100)

The endpoint never mutates catalog data and never calls Google. It evaluates the current search-readiness rules, returns blocker and warning counts, identifies dedupe-only candidates, and preserves the rule that claimed locations are not eligible for routine Google refresh.

A later execution endpoint must reuse the same readiness logic and require explicit safeguards before changing `is_searchable` or invoking paid provider work.
