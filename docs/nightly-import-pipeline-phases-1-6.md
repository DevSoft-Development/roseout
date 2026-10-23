# Nightly Import Pipeline: Phases 1-6

## Goal

Replace the single-request nightly Google import with a resumable, observable ingestion pipeline that preserves the existing manual Google, NYC Open Data, OSM, and import-log controls under `/admin/dashboard/settings/location-tools/import`.

## Non-negotiable requirements

- Preserve existing import components and API endpoints.
- Add normalized hours and freshness metadata.
- Extract, normalize, validate, and recheck reservation or booking links.
- Cache Google images in the existing Supabase `location-images` bucket.
- Synchronize canonical locations and enqueue canonical search-profile refreshes.
- Prevent duplicate publication and incorrect market assignment.
- Use explicit quality, review, retry, and publishing states.
- Create versioned Supabase migrations only after checking the live and repository schema.
- Keep raw JSON behind developer details instead of using it as the primary UI.

## Phase 1: correctness

1. Fix hours parsing and persistence.
2. Fix Bronx versus Westchester market classification by prioritizing coordinates, borough/county, ZIP mapping, then city fallback.
3. Repair `location_claim_codes` schema/application mismatch.
4. Normalize reservation URLs and provider detection.
5. Add deterministic duplicate checks before enrichment.
6. Record partial success when downstream enrichment fails.

## Phase 2: resumable pipeline

Add `location_import_runs` and `location_import_items` tables with explicit statuses, cursors, attempts, metrics, errors, and retry timestamps.

The nightly scheduler creates bounded market runs. Workers claim small item batches and save progress after every item. A failed image, reservation, profile, or claim-code operation must not rerun candidate discovery.

Initial market quotas:

| Market | Restaurants | Activities |
| --- | ---: | ---: |
| NYC Core | 20 | 10 |
| Westchester | 10 | 5 |
| Long Island | 10 | 5 |
| Northern New Jersey | 10 | 5 |

## Phase 3: enrichment

Independent stages:

- Google details
- hours normalization
- reservation or booking-link extraction
- core record save
- canonical location synchronization
- Supabase image caching
- canonical search-profile refresh
- claim-code generation

Each stage records status, attempt count, source, verification time, and error.

## Phase 4: quality and publishing

Quality score components:

- valid geography and market
- identity and address
- category
- phone or website
- hours
- cached image
- operational business status
- canonical profile validity
- reservation status resolution

Absolute blockers include unresolved duplicates, wrong market, missing coordinates, permanent closure, invalid category, failed canonical sync, or failed profile validation.

Suggested states:

`discovered -> imported -> enrichment_pending -> image_pending -> profile_pending -> quality_review -> ready_to_publish -> published`

Locations may also enter `needs_enrichment`, `needs_review`, `failed`, `rejected`, `unpublished`, or `archived`.

## Phase 5: admin operations

Redesign the existing import page as an operations dashboard while retaining:

- `GoogleImportFormClient`
- NYC restaurant import
- OSM activity import
- OSM dry run
- import logs
- any future CSV component once a real CSV API exists

Add summary cards, market metrics, pipeline-stage metrics, failure reasons, run history, and actions for pause, resume, retry, profile rebuild, image retry, reservation retry, and publish approved.

## Phase 6: scale and maintenance

- Begin with 75 completed locations nightly.
- Increase only after seven consecutive healthy runs.
- Add per-market dynamic quotas.
- Add API and storage cost guards.
- Revalidate business status, hours, images, websites, and reservation links on separate schedules.
- Send one overnight report with imported, enriched, published, duplicate, failure, cost, and queue-age metrics.

## Required implementation files

The implementation should inspect and extend, rather than duplicate, these existing areas:

- `lib/googlePlacesImport.ts`
- `lib/location-growth/cacheGooglePhoto.ts`
- `lib/reservation-links.ts`
- `lib/sync-location.ts`
- `lib/search/profile/*`
- `app/api/admin/run-google-import/route.ts`
- `app/api/cron/location-search-profile-worker/route.ts`
- `app/admin/dashboard/settings/location-tools/import/page.tsx`
- `components/admin/location-tools/GoogleImportFormClient.tsx`
- `vercel.json`
- existing import-log and cron administration APIs

## Definition of done

A new restaurant is complete only when it has:

- valid Google Place ID
- correct market
- valid address and coordinates
- normalized phone and official website where available
- operational business status
- normalized hours or an approved exception
- resolved reservation status
- Supabase-cached image
- canonical location record
- validated canonical search profile
- cleared duplicate state
- calculated quality score
- assigned publishing state
- claim workflow where required
- complete import and audit logs

## Verification

Before marking the PR ready:

- run migrations against a disposable or staging Supabase project
- run build, lint, typecheck, and existing tests
- execute a bounded import for each market
- verify duplicate, wrong-market, missing-hours, image-failure, reservation-failure, and profile-failure paths
- verify pause/resume and retry behavior
- verify only qualified records become searchable
- inspect the import dashboard at desktop and mobile widths
