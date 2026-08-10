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

`buildLocationPayload` currently derives canonical `is_searchable` from required-field completeness. Source eligibility fields (`is_searchable`, `is_hidden`, `is_low_level`) are not part of that required-field calculation. This permits a source row to become non-searchable while its canonical `locations` row remains searchable.

## Multi-source identity rule

A canonical location is backed by:

1. its explicit `(source_table, source_id)` row; and
2. any restaurant/activity source row with the same non-null `google_place_id`.

No fuzzy name/address/phone matching is used for eligibility because those signals are not strong enough to disable or hide a production location automatically.

## Aggregation rule

For all backing sources:

- `active` is true when at least one source has an active status (`approved`, `active`, `published`, or `live`; a missing status is treated as active for legacy compatibility);
- `is_searchable` is true when at least one active source is explicitly searchable and is neither hidden nor low-level;
- `is_hidden` is true only when every backing source is hidden;
- `is_low_level` is true only when every backing source is low-level.

This means one disabled or hidden source cannot shut down a canonical location that still has another valid backing source.

## Enforcement

Migration `20260810162500_prevent_canonical_location_eligibility_drift.sql` adds narrow triggers on source eligibility/identity fields and on canonical source identity fields. Eligibility changes enqueue the existing `location_search_profile_refresh_queue` only when canonical eligibility actually changes.

Native/canonical-only locations with no restaurant/activity backing source are left untouched.

## Bounded operations diagnostic

Authenticated admins can call:

- `GET /api/admin/location-tools/eligibility-drift?limit=100` to inspect drift;
- `POST /api/admin/location-tools/eligibility-drift` with `{ "limit": 100 }` as a superadmin to repair a bounded batch.

The database functions hard-cap each scan/repair at 500 rows.
