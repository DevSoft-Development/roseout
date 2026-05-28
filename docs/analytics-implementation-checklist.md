# TheOutHaven Analytics Implementation Checklist

## Non-negotiable rules

- TheOutHaven theme is NOT gold.
- Do not use gold, #f5b700, gold borders, gold accents, or dark/gold language.
- Inspect the real theme from app/globals.css, tailwind.config.*, homepage components, admin components, and business dashboard components.
- Use the current project theme exactly.
- Primary analytics sources are analytics_events, outings, and locations.
- Old daily/hourly analytics tables are fallback only.
- Do not assume analytics_events.event_name exists.
- Support event_name, event_type, metadata.event_name, and metadata.event_type.
- Do not assume outings.location_id exists.
- Support source_location_id as fallback.
- Do not call owner-only routes from admin APIs.
- Do not expose guest PII.
- Do not show raw user IDs in analytics UI.
- Prefer .select("*") in evolving analytics routes.
- npm run lint and npm run build must pass.

## Task 1 — Create shared analytics utility

Create lib/analytics/new-business-analytics.ts.

Add types:
- AnalyticsRange
- AnalyticsEventRow
- OutingRow
- AnalyticsLocationRow

Add helpers:
- safeNumber
- pct
- getRangeStart
- normalizeEventName
- getEventLocationId
- getOutingLocationId
- isWithinRange
- normalizeCategory
- getLocationDisplayName
- getLocationCategory
- getLocationType
- buildAnalyticsSummary
- buildDailySeries
- buildLocationRollups
- buildFunnel
- buildInsights
- buildRecentActivity
- buildBirdsEyeLocations
- buildMostSearchedCategories
- buildEventBreakdown
- buildSourceBreakdown
- buildContactMethodBreakdown
- buildPlanBreakdown
- buildCityBreakdown
- buildBoroughBreakdown
- buildCategoryBreakdown
- buildConversionBreakdown

Normalize event name in this priority:
1. event.event_name
2. event.event_type
3. event.metadata?.event_name
4. event.metadata?.event_type

Count:
- profile views
- search appearances
- search clicks
- reserve clicks
- call clicks
- outing starts
- completed outings
- average rating
- matched vibe percentage
- would go again percentage
- completion rate
- action rate

## Task 2 — Category normalization

Inside lib/analytics/new-business-analytics.ts, normalize categories.

Remove ugly array/stringified array noise:
- ["theouthaven-friendly outing"]
- ["date-night"]
- []
- stringified arrays

Normalize readable labels:
- brunch spots -> Brunch
- brunch -> Brunch
- hookah lounge -> Hookah Lounge
- cafe -> Café
- seafood restaurant -> Seafood
- steakhouse -> Steakhouse

Do not distort analytics.
Do not convert steak dinner into Steakhouse unless actual location/category data supports it.

## Task 3 — Rebuild business analytics API

Update app/api/business/analytics/route.ts.

Accept:
- location_id
- range
- admin=1

Use:
- analytics_events.select("*")
- outings.select("*")
- locations.select("*")

Support:
- event_name/event_type/metadata fallback
- location_id/source_location_id fallback
- admin authorization when admin=1
- owner authorization when admin is not set

Return:
- success
- range
- plan
- location
- summary
- daily
- funnel
- insights
- recent_activity

Do not crash on empty analytics.

## Task 4 — Create admin analytics API

Create app/api/admin/business-analytics/route.ts.

Require admin/superadmin/editor/viewer access.

Accept:
- range
- q
- type
- status
- plan
- city
- borough
- category
- sort
- direction
- filtered

Query:
- locations.select("*")
- analytics_events.select("*")
- outings.select("*")

Return:
- success
- range
- summary
- daily
- top_locations
- low_conversion_locations
- birds_eye_locations
- most_searched_categories
- event_breakdown
- source_breakdown
- contact_method_breakdown
- plan_breakdown
- city_breakdown
- borough_breakdown
- category_breakdown
- conversion_breakdown
- recent_activity

Do not call owner-only APIs.

## Task 5 — Admin filtering and sorting

In app/api/admin/business-analytics/route.ts, support filtering and sorting.

Search q must match:
- location name
- restaurant name
- activity name
- city
- borough
- neighborhood
- state
- category
- cuisine
- activity type
- owner email
- claimed email

Filtering applies to:
- birds_eye_locations
- detailed tables

Platform summary remains unfiltered unless filtered=1.

If filtered=1, include:
- filtered
- filtered_summary
- filter_meta

Default sort:
1. completed_outings descending
2. search_clicks descending
3. profile_views descending

## Task 6 — Bird’s Eye View

Add admin-only Bird’s Eye View to /admin/dashboard/analytics.

Show all locations with:
- Location
- Type
- City / Borough
- Category
- Owner / Claim status
- Pro status
- Profile views
- Search appearances
- Search clicks
- Reserve clicks
- Call clicks
- Outing starts
- Completed outings
- Completion rate
- Action rate
- Average rating
- Matched vibe %
- Would go again %
- Last activity date
- Health status

Health statuses:
- Strong
- Needs attention
- No activity yet
- Missing owner
- Profile opportunity
- Conversion issue

Include sorting, quick filters, View details, and Open location action if route exists.

## Task 7 — Inline location search

Add inline search to /admin/dashboard/analytics.

Placeholder:
Search locations, owners, cities, categories…

Add result count:
Showing X of Y locations

Add quick filter chips:
- All
- Pro
- Claimed
- Unclaimed
- Restaurants
- Activities
- High views
- Low conversion
- Needs attention

Search should filter Bird’s Eye View.

## Task 8 — Most searched categories

Add admin-only Most searched categories section.

Use analytics_events and location data.

Detect category from:
- metadata.category
- metadata.primary_category
- metadata.cuisine
- metadata.cuisine_type
- metadata.activity_type
- metadata.intent
- metadata.query
- metadata.search_query
- metadata.filters
- metadata.location_type
- locations.primary_category
- locations.category
- locations.cuisine
- locations.cuisine_type
- locations.activity_type
- locations.location_type

Show:
- Top 3 cards
- Top 10 table
- Category
- Type
- Searches
- Clicks
- Reserve/call clicks
- Completed outings
- Completion rate

Do not hardcode results.

## Task 9 — Deeper admin analytics breakdowns

Add UI and API support for:
- event_breakdown
- source_breakdown
- contact_method_breakdown
- plan_breakdown
- city_breakdown
- borough_breakdown
- category_breakdown
- conversion_breakdown

Use defensive Unknown fallback for missing values.

## Task 10 — Refactor location owner analytics API

Update app/api/location-owner/analytics/route.ts.

Use shared analytics utility.
Use .select("*").
Do not select only event_name.
Support event normalization.
Support source_location_id.
Keep owner authorization.
Return same metrics as business analytics route.
Do not crash on empty tables.

## Task 11 — Redesign shared dashboard component

Refactor components/analytics/BusinessAnalyticsDashboard.tsx.

Support:
- mode="admin"
- mode="owner"
- locations
- initialLocationId

Use actual TheOutHaven theme.
Do not use gold.
Use premium dark luxury style matching existing project.

Shared sections:
- Hero/header
- KPI strip
- Conversion funnel
- Daily performance
- Growth insights
- Recent activity
- Empty state

Admin sections:
- Platform analytics
- Business performance
- Top locations
- Needs attention
- Recent activity
- Bird’s Eye View
- Most searched categories
- Event breakdown
- Source breakdown
- Contact method breakdown
- City performance
- Borough performance
- Category performance
- Plan performance
- Conversion breakdown

Owner sections:
- Your analytics
- Guest actions
- Outing conversion
- Growth recommendations
- Recent guest activity

## Task 12 — Redesign admin analytics page

Update app/admin/dashboard/analytics/page.tsx.

Require admin role.
Render BusinessAnalyticsDashboard in admin mode.
Use /api/admin/business-analytics.
Use /api/business/analytics?admin=1&location_id=... for selected location drilldown.
Remove clutter.
Use real theme.

Must include:
- Platform overview
- Business performance
- Inline location search
- Bird’s Eye View
- Most searched categories
- Top locations
- Needs attention
- Recent activity
- More analytics breakdowns

## Task 13 — Admin location drilldown

When admin clicks View details:
- Select location
- Fetch /api/business/analytics?admin=1&location_id=<id>&range=<range>
- Show selected location metrics
- Show KPI strip
- Show daily performance
- Show funnel
- Show recent activity
- Show insights
- Do not navigate away unless Open location is clicked

## Task 14 — Redesign location owner analytics page

Update app/business/dashboard/analytics/page.tsx.

Resolve user/impersonation as current page does.
Fetch owner’s claimed/owned locations.
Render BusinessAnalyticsDashboard in owner mode.
Do not show admin analytics.
Do not allow owners to select locations they do not own.

Empty state:
Title: No claimed locations yet
Body: Claim a location to unlock guest actions, outing completions, and business analytics.
CTA to claim/import location.

## Task 15 — Event tracking consistency

Update:
- app/api/outings/start/route.ts
- app/api/outings/complete/route.ts
- lib/analytics/trackEvent.ts if needed

Record:
- outing_started
- reserve_clicked
- call_clicked
- outing_completed
- outing_completion_rating_submitted

Also call trackLocationAnalyticsEvent if available.

Map:
- reserve_clicked -> reservation_started
- call_clicked -> phone_click
- outing_completed -> reservation_completed

Wrap secondary analytics in Promise.allSettled.
Analytics must never block user actions.

## Task 16 — Security and privacy

Admin analytics:
- require admin/superadmin/editor/viewer permission
- never expose owner-only restricted data

Owner analytics:
- only show locations owned/claimed by current user
- match owner_user_id, owner_email, claimed_by_email
- unauthorized returns 403

Privacy:
- no guest PII
- no raw user ids/emails in UI
- aggregate analytics only

## Task 17 — UI polish

Use premium copy:
- Track what guests do after discovering your location.
- Reserve clicks, phone calls, and completed outings are tracked from the new TheOutHaven analytics system.
- Analytics will appear after guests view, call, reserve, or complete outings.

Style:
- dark luxury
- current TheOutHaven accents only
- minimal clutter
- large cards
- soft borders
- clean tables
- premium spacing
- Resy-like simplicity

Do not:
- use gold
- add second footer
- add unrelated nav
- add bright admin template
- add unnecessary chart libraries
- show JSON/debug data

## Task 18 — Build and test

Run:
npm run lint
npm run build

Fix all TypeScript and build errors.

Final expected result:
- Admin analytics is premium and complete.
- Owner analytics is premium and owner-safe.
- Inline search works.
- Bird’s Eye View works.
- Most searched categories works.
- Deeper breakdowns work.
- Admin drilldown works.
- Owner authorization works.
- Analytics uses analytics_events, outings, locations.
- Empty states work.
- Build passes.
