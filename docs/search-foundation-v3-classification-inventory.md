# Search Foundation V3 classification inventory

The canonical profile is derived from `public.locations`; writers never write profiles directly. The additive `locations_enqueue_search_profile` trigger queues a refresh only when a classification, lifecycle, or geographic source column changes. Synchronous CRM/admin mutations may additionally call `refreshLocationSearchProfile(id, reason)` so the response includes validation.

## Source fields and precedence

| Group | Fields | Priority / overwrite policy |
|---|---|---|
| Identity | `location_type`, `restaurant_name`, `activity_name`, `primary_category`, `activity_type` | Admin-verified/manual overrides outrank verified classification, structured values, then providers. Curated values must not be replaced by lower-priority import data. |
| Classification | `cuisine`, `cuisine_type`, `tags`, `vibe_tags`, `best_for_tags`, `date_style_tags`, `search_keywords`, `google_types`, `semantic_tags`, `intent_tags` | Structured and curated evidence is strong; imported keywords and generated tags are supporting unless verified. |
| Documents | `search_document`, `semantic_search_text`, `description` | Supporting retrieval evidence only; never independently satisfies a hard classification requirement. |
| Lifecycle | `public_visibility_tier`, `curation_tier`, `source_quality_status`, `quality_status`, `data_status`, `status`, `is_searchable`, `is_hidden`, `is_low_level`, `active`, `deleted_at` | Eligibility gates; never inferred. |
| Geography | `market`, `city`, `neighborhood`, `borough`, `county`, `state`, `latitude`, `longitude` | Structured location values; refresh required after changes. |

## Active writer inventory

| Writer / operation | Repository path | Values written | Validation / refresh |
|---|---|---|---|
| Google import and enrichment | `app/api/admin/location-tools/import/google/route.ts`, `scripts/enrich-google-locations.ts`, `supabase/functions/google-place-enrichment/index.ts` | provider types, coordinates, address, category, keywords | Import validation plus database-triggered queue refresh. |
| Specialty, OSM, and NYC import | `app/api/admin/location-tools/import/`, `scripts/location-growth-runner.mjs`, `supabase/functions/location-import-worker/index.ts` | identity, category, tags, geography, lifecycle | Bounded import; trigger deduplicates active refreshes. |
| Admin location editor | `app/api/admin/locations/[id]/route.ts` | editable identity, classification, lifecycle, geography | Admin authorization and edit validation; trigger refresh. |
| CRM editor and automation | `app/api/admin/crm/locations/[id]/route.ts`, `lib/crm/automation/` | classification, publishing, enrichment state | Admin authorization; trigger refresh. |
| Duplicate merge | `app/api/admin/location-tools/duplicates/`, `lib/location-dedupe/` | surviving structured and curated values, deleted state | Merge validation; both affected records are trigger-refreshed/cascade-deleted. |
| Data quality, hidden, publishing, and market repair | `app/api/admin/location-tools/`, `lib/location-publishability.ts` | lifecycle, visibility, geography, quality | Protected bulk APIs; trigger queues bounded idempotent work. |
| AI enrichment | `supabase/functions/ai-enrich-locations/index.ts`, `scripts/` enrichment jobs | generated semantic/taxonomy tags and descriptions | Generated text remains supporting; trigger refresh. |
| SQL migrations, cleanup and repair | `supabase/migrations/`, `scripts/` | legacy classification and lifecycle columns | Additive trigger covers active updates after this migration; historical applied migrations are immutable. |

`classification_sources` and evidence in the profile preserve the winning field/source. Manual overrides are validated at the protected API boundary and remain stored separately so a rebuild cannot silently erase them. Profile construction is deterministic and query-independent.
