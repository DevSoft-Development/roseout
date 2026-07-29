# Search Foundation V3 classification writer inventory

Classification-relevant fields include names/type/category metadata, cuisine/food/features, description, lifecycle/searchability, geography, and coordinates.

| Writer family | Strategy |
|---|---|
| Search Profiles single-location rebuild and manual admin review | Synchronous `refreshLocationSearchProfile`; the administrator receives the write result. |
| Search Profile backfill run processor | Durable run item with atomic lease, then synchronous refresh inside the worker. |
| Bulk import and Google enrichment routes | Queue with `enqueueLocationSearchProfileRefresh` after their database transaction; these existing writers must deploy the V3 migration before enabling queue calls. |
| Admin location editor / CRM edits | Synchronous refresh after successful direct edit. |
| Data-quality, hidden-location, publishability, and market repair tools | Queue refresh because actions can affect many locations. |
| SQL-only maintenance and migrations | Follow with an explicit CLI/admin backfill run because application callbacks cannot execute inside SQL. |

The profile builder is the sole classification implementation. Writers must never reproduce taxonomy logic.
