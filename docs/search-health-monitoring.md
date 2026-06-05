# Search Health Monitoring

Search Health records monitoring-only events for TheOutHaven search. It must not change enterprise ranking, default market behavior, walking pairing logic, result ordering, or user-facing search behavior.

## What it tracks

`public.search_health_events` captures warning/error/debug metadata for:

- No restaurant results.
- No activity results.
- No valid mixed outing pairs.
- Strict walking searches with low pair counts.
- Slow or degraded searches.
- Walking-route suppression warnings.
- Low-quality pair suppression.
- Admin Search Lab debug runs.
- Beta tester QA search issues and feedback runs.
- Manual admin test events.

Public routes use warning-only logging: clean successful public searches are not logged. Admin Search Lab and beta tester routes can log more aggressively for diagnostics.

## Event classification

Events are classified by `lib/search/enterprise/searchHealthLogger.ts` using this priority:

1. `admin_test_event` -> `test_event`, `info`.
2. Errors -> `search_error`, `error`.
3. No restaurant results -> `no_restaurant_results`, `warning`.
4. No activity results -> `no_activity_results`, `warning`.
5. No valid pairs -> `no_valid_pairs`, `warning`.
6. Strict walking low-pair searches -> `low_pair_count`, `info`.
7. Slow searches -> `slow_search`, `warning`.
8. Walking route warnings -> `walking_route_warning`, `warning`.
9. Quality warnings -> `quality_warning`, `info`.
10. Successful Search Lab debug runs -> `successful_debug_run`, `info`.

For the known public warning query:

```text
steak dinner and rooftop drinks 1 minute walk apart in Queens
```

with restaurants and activities found but zero pairs, the expected event is:

```text
source = public_create_search
event_type = no_valid_pairs
severity = warning
event_label = No valid pairs within walking distance
no_pairs_reason = no_pairs_within_walking_distance
```

It should not be labeled as no activity results when activities were found.

## Routes that log

Existing routes that call enterprise search pass source metadata into the search health logger:

- `/api/generate` -> `public_create_search` or `beta_tester_search`.
- `/api/explore/search` -> `public_explore_search` or `beta_tester_search`.
- `/api/admin/beta/search-lab` -> `admin_search_lab`.

The central enterprise search pipeline also calls `logSearchHealthEvent` after debug data is built, and logging failures are caught so user searches continue.

## Admin dashboard

Open:

```text
/admin/dashboard/search-health
```

The dashboard includes summary cards, filters, recent events, top event types, no-pair reasons, no-result reasons, slowest searches, common failing queries, events by source, event details, debug JSON copy, review status updates, test-event insertion, and manual digest sending.

The AdminTopBar link is under:

```text
Admin Tools > System > Search Health
```

## SQL verification

```sql
select
  count(*) as total_search_health_events,
  max(created_at) as latest_event
from public.search_health_events;
```

```sql
select
  id,
  created_at,
  source,
  event_type,
  severity,
  event_label,
  raw_query,
  pair_count,
  no_results_reason,
  no_pairs_reason,
  speed_status,
  review_status
from public.search_health_events
order by created_at desc
limit 20;
```

Digest run check:

```sql
select
  id,
  created_at,
  source,
  sent,
  recipient_count,
  total_events,
  error_count,
  warning_count,
  no_pair_count,
  no_result_count,
  slow_count
from public.search_health_digest_runs
order by created_at desc
limit 20;
```

## Manual test event

In the admin dashboard, click **Create test event**, or call:

```bash
curl -i -X POST https://theouthaven.com/api/admin/search-health/test-event
```

The endpoint requires an authenticated admin/superadmin session.

## Send digest now

In the admin dashboard, click **Send digest now**. The browser calls `/api/admin/search-health/send-digest`, which calls the Supabase Edge Function server-side with `x-cron-secret`. `CRON_SECRET` is never exposed to the browser.

## Edge Function deployment

Deploy the digest function:

```bash
supabase functions deploy admin-search-health-digest
```

Set required secrets:

```bash
supabase secrets set RESEND_API_KEY=...
supabase secrets set SEARCH_HEALTH_DIGEST_TO=admin@example.com,owner@example.com
supabase secrets set SEARCH_HEALTH_DIGEST_FROM=no-reply@theouthaven.com
supabase secrets set CRON_SECRET=...
supabase secrets set SITE_URL=https://theouthaven.com
```

Manual Edge Function test:

```bash
curl -i -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-search-health-digest" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -d '{"source":"manual","hours":24,"force":true}'
```

## Cron setup

Use `supabase/search-health-digest-cron.sql` after replacing:

- `YOUR_PROJECT_REF`
- `YOUR_CRON_SECRET`

The job runs at `0 13 * * *`, which is 8 AM EST and 9 AM EDT. Adjust seasonally if exact 8 AM New York delivery is required.

## Required environment variables and secrets

Next.js server/API routes:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- optional `SEARCH_HEALTH_DIGEST_FUNCTION_URL`

Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `SEARCH_HEALTH_DIGEST_TO`
- `SEARCH_HEALTH_DIGEST_FROM`
- `CRON_SECRET`
- `SITE_URL` or `NEXT_PUBLIC_SITE_URL`

## Safety notes

- RLS is enabled and no public policies are added for Search Health tables.
- Admin reads/writes happen through protected server routes and the service-role client.
- Debug JSON is capped and redacts token/secret-like keys.
- Digest emails intentionally omit huge debug JSON and rejected-pair lists.
