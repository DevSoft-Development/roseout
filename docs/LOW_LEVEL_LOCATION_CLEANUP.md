# Low-Level Location Cleanup

TheOutHaven is an outing planner, not a generic map dump. A **low-level location** is a record that is unlikely to be outing-worthy for public discovery by default: takeout-only counters, delis, bodegas, markets, convenience stores, grocery stores, smoke/liquor/pharmacy/gas/laundromat/check-cashing records, food carts/trucks, weak generic restaurants, missing-photo records, and unverified NYC/Open Data restaurant imports.

## Hide, Do Not Delete

The cleanup system never deletes records. Low-level records stay available to admin/CRM workflows with flags such as `is_low_level`, `low_level_reason`, `public_visibility_tier`, `source_quality_status`, and `import_confidence`.

## Why NYC Generic Restaurant Imports Are Not Trusted

NYC inspection/open-data imports often only prove that a business was inspected as a restaurant. That is not enough for TheOutHaven public search. Generic NYC restaurant records remain hidden/needs-review until enriched with a real public photo, rating, review count, valid address, coordinates, non-placeholder name, and non-duplicate/non-closed status.

## Public Search Exclusions

Public-facing search, Explore, restaurant APIs, homepage sections, sitemap, and enterprise search exclude records by default when they are:

- `is_low_level = true`
- `public_visibility_tier in ('low_level','hidden')`
- `curation_tier = 'low_level'`
- `source_quality_status in ('imported_unverified','generic_restaurant','needs_enrichment','low_level_review')`
- `import_confidence = 'low'`
- missing photos or `photo_status = 'missing_photo'`
- missing address/coordinates/main image
- duplicates, closed, archived, hidden, not clean, or not publish-ready

Intentional low-level queries such as “Chinese takeout near Queens,” “nearby deli,” or “cheap eats” can opt into low-level matching in the search helper, while still penalizing missing-photo and weak records.

## Run Cleanup

After deploying the migration, run:

```sql
select public.oh_cleanup_low_level_locations();
```

The RPC rescans `public.locations`, updates low-level flags/reasons/visibility tiers, hides obvious non-outing categories, and returns summary counts.

## Restore a Location

Admins can manually restore a record after review:

```sql
select public.oh_restore_location_from_low_level('<location-id>'::uuid);
```

Restore clears low-level flags, resets public visibility to `standard`, and only makes the record searchable when required public fields/photos/status/duplicate checks pass.

## Admin Review

Use `public.admin_low_level_location_summary` to audit totals by reason, source quality, and visibility tier. Admin CRM/location pages should keep low-level records visible with badges for low-level reason, public visibility tier, curation tier, source quality, import confidence, searchable state, and photo status.
