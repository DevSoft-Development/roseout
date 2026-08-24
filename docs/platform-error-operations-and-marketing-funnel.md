# Platform Error Operations and Marketing Funnel

## Morning operations sequence

- 6:15 AM Eastern — Platform Error Digest
- 6:30 AM Eastern — Search Health
- 7:00 AM Eastern — reserved for Sales / CRM
- 7:30 AM Eastern — Daily Marketing Pulse

All scheduled digest functions use an America/New_York local-time guard with dual UTC cron windows for DST-safe delivery.

## Platform error operations

`platform_error_events` is the normalized source of truth for production application failures. Coverage includes browser runtime errors, unhandled promise rejections, Next.js request/render/route errors, and semantic/common user-visible error states. Duplicate incidents are grouped by fingerprint.

Search quality issues such as no results, no valid pair, partial fulfillment, or successful fallback remain in Search Health. True technical search failures may also appear in Platform Error Operations.

Admin dashboard: `/admin/dashboard/platform-errors`

## Marketing Pulse

The 7:30 AM Marketing Pulse now includes:

- Home page views
- `/create` views
- Average measured session duration
- Public searches in the last 24 hours
- DoD, WoW, and MoM search-volume comparisons
- Search funnel completion count and rate
- Stage-by-stage funnel conversion and drop-off counts / percentages
- Existing location, neighborhood, cuisine, activity, search-theme, acquisition, and engagement sections

The search funnel is session-based:

1. `/create` viewed
2. Search started
3. Results completed
4. Result engaged
5. `/plan` reached — search-flow completion
6. Plan action — post-search behavior

Site/session/funnel metrics are aggregated in Postgres through `get_marketing_site_metrics` so digest generation does not need to pull raw heartbeat data into the Edge Function.
