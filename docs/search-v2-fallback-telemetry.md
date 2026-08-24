# Search V2 fallback telemetry

`/create` V2 search analytics persist fallback telemetry on `search_events`.

- `search_core_version` identifies V2 events.
- `v2_fallback_outcome` stores `outcome|type|reason` for a fallback/recovery path.
- `v2_issue_codes` includes fallback and partial-fulfillment codes.
- Full structured fallback fields remain in sanitized search metadata under `normalizedIntent`.

The daily Search Operations Brief reads these production fields and only lists actionable searches from the previous 24 hours.
