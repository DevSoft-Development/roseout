# Canonical location eligibility

## Source-to-canonical sync inventory

The application has one shared canonical writer in `lib/sync-location.ts`:

- `syncRestaurantToLocation`
- `syncActivityToLocation`
- `syncSourceRowToLocation`

Known callers include:

- `lib/googlePlacesImport.ts`
- `app/api/admin/run-google-import/route.ts`
- `scripts/import-outer-market-locations.ts`
- `app/api/google/specialty-import/route.ts`
- `app/api/admin/restaurants/enrich-google-metadata/route.ts`

The canonical writer upserts `locations` on `(source_table, source_id)`. Source rows can also be changed by admin/import/enrichment code without immediately calling the canonical writer, so eligibility correctness cannot safely depend on every caller remembering to resync.

## Root cause

`buildLocationPayload` derives canonical `is_searchable` from canonicalizable required-field completeness, while historical restaurant/activity rows often retain a stale default `is_searchable=false`. A live production audit found 3,598 canonical/source searchability mismatches if that legacy source flag were copied blindly, so raw `source.is_searchable=false` is not safe evidence by itself.

The repair therefore normalizes source searchability from the same effective quality contract used to make a canonical row searchable: active status, visible/not-low-level state, name, address, city/state, coordinates, and an image from `main_image`, `image_url`, or `images`.

## Multi-source identity rule

A canonical location is backed by:

1. its explicit `(source_table, source_id)` row; and
2. any restaurant/activity source row with the same non-null `google_place_id`.

There are currently hundreds of canonical locations with more than one such backing source, so one source cannot be treated as the whole truth.

No fuzzy name/address/phone matching is used for eligibility because those signals are not strong enough to disable or hide a production location automatically.

## Aggregation rule

For all backing sources:

- `active` is true when at least one source has an active status (`approved`, `active`, `published`, or `live`; a missing status is treated as active for legacy compatibility);
- `is_searchable` is true when at least one backing source satisfies the effective canonical quality/searchability contract;
- `is_hidden` is true only when every backing source is hidden;
- `is_low_level` is true only when every backing source is low-level.

This means one disabled, hidden, or low-level source cannot shut down a canonical location that still has another valid backing source.

## Enforcement

Migration `20260810162500_prevent_canonical_location_eligibility_drift.sql`:

- normalizes `restaurants.is_searchable` and `activities.is_searchable` on future source writes from the effective quality contract;
- reconciles canonical eligibility after source eligibility/identity changes;
- reconciles newly linked canonical rows after `(source_table, source_id, google_place_id)` changes;
- handles old and new Google Place IDs when a source identity changes;
- disables an orphaned source-backed canonical row when its only source is removed;
- enqueues `location_search_profile_refresh_queue` only when canonical eligibility actually changes.

Native/canonical-only locations with no restaurant/activity source identity are intentionally left untouched.

## Bounded operations diagnostic

Authenticated admins can call:

- `GET /api/admin/location-tools/eligibility-drift?limit=100` to inspect drift;
- `POST /api/admin/location-tools/eligibility-drift` with `{ "limit": 100 }` as a superadmin to repair a bounded batch.

Both database functions hard-cap each scan/repair at 500 rows. Existing production drift is not automatically bulk-mutated by the migration; it is surfaced and repaired in bounded batches after review.
