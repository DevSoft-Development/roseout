# Search Health Monitoring

TheOutHaven uses two related search logging tables.

## public.search_events

Lightweight all-search history.

Used for:
- Every public create search
- Every public explore search
- Successful searches
- Basic product analytics
- Search volume
- Query history
- Result counts
- Pair counts
- Timing

This table should not store full heavy debug JSON for every search.

Recommended retention:
- Keep detailed rows for 90 days.
- Keep aggregate analytics longer.

## public.search_health_events

Issue/debug-focused search monitoring.

Used for:
- No results
- No valid pairs
- Slow searches
- Parser issues
- Warnings
- Errors
- Admin search lab events
- Beta tester debugging
- Debug events

Recommended retention:
- Keep detailed debug rows for 30 to 90 days.
- Keep summaries longer.

## Production default

SEARCH_HEALTH_LOG_ALL_PUBLIC_SEARCHES=false

Set it to true only temporarily when debugging.
