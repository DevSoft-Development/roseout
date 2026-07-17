# Canonical analytics event fix

This branch routes legacy result-card view and click analytics through the canonical analytics ingestion endpoint.

## Changes

- Persist the active search context in session storage whenever a canonical search event includes a `search_id`.
- Automatically attach the active `search_id`, query, normalized query, and source to subsequent client events.
- Map legacy result-card `view` events to `location_impression`.
- Map legacy result-card `click` events to `location_clicked`.
- Continue including legacy event metadata for transition diagnostics.
- Add a production SQL verification query for canonical event correlation.

## Expected result

A search should produce canonical search lifecycle rows and result-card events sharing the same `search_id`, `anonymous_id`, and `session_id`.
