# Google Places budget endpoint

The admin Google Places budget endpoint is a web-app BFF for the AWS-hosted Location Intelligence API.

Operational rules:

- Vercel does not run Location Intelligence workloads; it only proxies authenticated admin requests to AWS.
- Google Places usage is centrally metered from AWS Integration API calls, including address autocomplete, address details, rich place details, text search/discovery, and photo media.
- Monthly target, soft-cap, hard-cap, credits, and month-scoped opening-spend reconciliation are runtime settings and do not require a code deployment to change.
- Claimed locations are excluded from routine Google refreshes unless an explicit owner/admin resync is requested.
- Catalog repair and enrichment throughput should be queue-controlled; the Location Intelligence Lambda currently uses the account unreserved concurrency pool until the account-level Lambda quota has more reserved-concurrency headroom.

This file is also intentionally within the Location Intelligence workflow path filter so operational changes to this endpoint run the focused AWS validation/deployment workflow.
