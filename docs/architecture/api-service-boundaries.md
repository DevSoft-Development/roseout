# TheOutHaven API service boundaries

The public web application remains on Vercel/Next.js. The goal of these boundaries is to stop one runtime from owning every class of work while preserving existing public route compatibility during migration.

## 1. Core API

Owns low-latency transactional business operations:

- CRM
- contacts and customers
- reservations and schedules
- settings
- subscription state
- business/location configuration
- event and experience CRUD

Rules:

- Requests should complete synchronously.
- Prefer Supabase Data API / `supabase-js` for normal application CRUD.
- Do not open a new raw Postgres connection per request.
- If a service requires raw Postgres, use the Supabase pooler/Supavisor transaction endpoint rather than the direct database host.
- Core API must not perform durable background work inline.

## 2. AI / Search API

Owns CPU- and model-heavy work:

- search embeddings
- semantic retrieval helpers
- reranking
- intent classification
- assistant inference/actions that require model execution
- photo/text classification and translation used by search

Current production search ML runs on AWS App Runner and is independently autoscaled.

Rules:

- Vercel may proxy or orchestrate, but it should not execute Hugging Face inference itself.
- The ML runtime must enforce an internal inference concurrency limit.
- App Runner scales horizontally before a single 4-vCPU instance is saturated.
- Saturation returns a retryable response so callers can fall back to deterministic/non-ML ranking rather than failing the entire search.

## 3. Integration API

Owns outbound third-party provider operations:

- Microsoft 365
- Google
- domain registrar/DNS providers
- Apple business integrations
- Meta/social providers
- other external APIs

Rules:

- Provider credentials remain server-only.
- Provider-specific timeouts, retries, circuit breakers and rate-limit handling live here.
- Interactive reads/writes may be synchronous when the provider is fast enough.
- Reconciliation, imports, backfills and non-interactive writes must enqueue Async operations.

## 4. Async operations

Owns any work that does not have to finish before the HTTP response:

- scheduled jobs
- email/SMS/bulk delivery
- imports/backfills
- enrichment
- reconciliation
- retries
- maintenance
- durable integration work

Target path:

`Vercel/Core/Integration -> AWS job gateway -> SQS -> Lambda/ECS worker`

EventBridge Scheduler owns time-based invocation. Supabase `pg_cron` stays empty on the Virginia production primary.

## Compatibility migration

Do not mass-rewrite the existing `app/api/*` surface in one release. Instead:

1. Keep existing public Next.js route paths stable.
2. Move implementation behind domain clients/services.
3. Route heavy AI/search work to the AI/Search API.
4. Route third-party provider logic to the Integration API.
5. Enqueue durable work through the existing AWS platform job gateway.
6. Move Core API endpoints only where there is a measurable scaling or operational reason; Vercel can remain a thin BFF for browser authentication/session handling.

This approach gives TheOutHaven separate scaling and failure domains without requiring a disruptive public API version change before launch.
