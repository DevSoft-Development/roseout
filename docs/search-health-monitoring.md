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

## Location publishability guardrails

Active public search markets are centrally defined in `ACTIVE_MARKET_STATES` as `NY`, `NJ`, and `CT`. Out-of-market rows may remain in `public.locations`, but should not be made public/searchable until that central config includes their state.

### Admin review workflow

- Open `/admin/dashboard/locations/non-searchable` to review active-market locations where `is_searchable` is false.
- Each row shows its publishability label, primary reasons, quality/source/import status, visibility tier, hidden/low-level flags, duplicate status, and whether it is eligible for approval.
- Use **Approve for search** for one eligible row.
- Use **Approve selected** or **Approve all ready in current filter** for bulk approval. Bulk approval only approves eligible rows and skips rows that still need fixes.
- Rows are never automatically approved when they are hidden, low-level, imported-unverified, low-confidence, missing photos, missing coordinates, missing address, duplicate, out-of-market, rejected, closed, or archived.
- Use the repair endpoint with `dryRun: true` to preview updates: `POST /api/admin/locations/repair-publishability` with `{ "action": "repair", "dryRun": true, "limit": 100 }`.

### SQL verification queries

```sql
select
  state,
  count(*) filter (where is_searchable = true and quality_status = 'publish_ready') as good_searchable_publish_ready,
  count(*) filter (where is_searchable = true and quality_status is distinct from 'publish_ready') as searchable_but_not_publish_ready,
  count(*) filter (where coalesce(is_searchable, false) = false and quality_status = 'publish_ready') as publish_ready_but_not_searchable,
  count(*) filter (where coalesce(is_searchable, false) = false and quality_status is distinct from 'publish_ready') as not_ready_not_searchable
from public.locations
where state in ('NY', 'NJ', 'CT')
group by state
order by state;
```

```sql
select
  state,
  count(*) as bad_searchable_hidden_or_low_level
from public.locations
where state in ('NY', 'NJ', 'CT')
  and is_searchable = true
  and (
    coalesce(is_hidden, false) = true
    or coalesce(is_low_level, false) = true
    or public_visibility_tier in ('hidden', 'low_level', 'internal', 'pending_review', 'rejected')
    or quality_status in ('low_level_review', 'needs_photo')
    or source_quality_status in ('low_level_review', 'imported_unverified')
    or coalesce(import_confidence, '') = 'low'
    or coalesce(has_photos, false) = false
  )
group by state
order by state;
```

```sql
select
  state,
  location_type,
  count(*) as ready_to_approve
from public.location_publishability_audit
where ready_to_approve = true
group by state, location_type
order by state, location_type;
```

Expected results after cleanup:

```txt
searchable_but_not_publish_ready = 0
publish_ready_but_not_searchable = 0
bad searchable hidden/low-level query returns no rows
```
