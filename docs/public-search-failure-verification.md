# Public search failure verification

This guide covers safe local and automated verification for `/api/generate` failure behavior.

## Local 400 checks with curl

Malformed JSON:

```bash
curl -i -X POST http://127.0.0.1:3000/api/generate \
  -H 'Content-Type: application/json' \
  --data '{'
```

Missing query:

```bash
curl -i -X POST http://127.0.0.1:3000/api/generate \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Invalid latitude:

```bash
curl -i -X POST http://127.0.0.1:3000/api/generate \
  -H 'Content-Type: application/json' \
  --data '{"input":"dinner","latitude":91}'
```

## Request ID propagation

Send a valid request ID and verify the JSON `requestId` equals the `X-Request-ID` response header:

```bash
curl -i -X POST http://127.0.0.1:3000/api/generate \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: local-public-search-req-1' \
  --data '{"input":"steak dinner with hookah after in queens"}'
```

Invalid incoming IDs containing spaces or unsafe characters are replaced by generated UUIDs.

## Automated failure simulations

Focused Vitest suites use the public controller dependency-injection seam rather than production-only query parameters or headers.

- 429 is simulated by injecting `checkLimit` with `allowed: false`.
- 503 is simulated by injecting a required dependency failure from identity, limit, or search dependencies.
- 504 is simulated with controller deadline helpers and deferred promises.
- Logger rejections are simulated by injecting rejecting analytics, search-health, route-timing, usage-recording, and diagnostic callbacks.

These tests assert stable response keys, request ID propagation, empty result arrays on failures, and redaction of stack traces, SQL, Supabase URLs, service-role keys, and raw exception messages.

## Do not disable production Supabase intentionally

Production Supabase is a required dependency for public search. Do not intentionally remove or corrupt production Supabase environment variables to test failures. Use local environments and automated dependency-injection tests so customer traffic is not affected and service-role credentials are never exposed.

## Canonical response examples

Successful response shape:

```json
{
  "success": true,
  "status": "success",
  "requestId": "local-public-search-req-1",
  "restaurants": [],
  "activities": [],
  "pairs": [],
  "cards": [],
  "counts": { "restaurants": 0, "activities": 0, "pairs": 0, "cards": 0 },
  "error": null
}
```

Invalid request response shape:

```json
{
  "success": false,
  "status": "invalid_request",
  "requestId": "local-public-search-req-1",
  "restaurants": [],
  "activities": [],
  "pairs": [],
  "cards": [],
  "error": { "code": "QUERY_REQUIRED", "retryable": false }
}
```

## Focused commands

```bash
npx vitest run lib/search/public-api
npx vitest run lib/search/enterprise/__tests__/pairing.test.ts
npm run test:search-route-regression
npm run test:enterprise-search
```
