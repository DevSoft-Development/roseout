# Production Readiness Audit — 2026-05-24

Scope: build errors, search/card reliability, route security, env variables, Stripe webhooks, and reservation double-booking.

## Executive summary

- **Build status:** `next build` passes.
- **Lint/type quality status:** `eslint` fails with a high volume of errors (mostly `no-explicit-any` and `set-state-in-effect`) and currently blocks production-quality maintainability.
- **Most critical runtime risks found:**
  1. **Stripe webhook endpoint does not verify Stripe signatures cryptographically** and trusts request JSON if any `stripe-signature` header exists.
  2. **Multiple API routes that appear admin-only do not require an authenticated admin role check** and some instantiate Supabase with service-role credentials directly.
  3. **Reservation creation flow can still race under concurrent requests** because availability checks and inserts are not performed in a DB transaction/constraint-backed atomic path.

## Findings by area

### 1) Build errors

- `npm run build` succeeds (Next.js 16.2.4, production build completed).
- `npm run lint` fails with **506 total problems** (459 errors, 47 warnings). Dominant categories:
  - `@typescript-eslint/no-explicit-any`
  - `react-hooks/set-state-in-effect`
  - some `react-hooks/exhaustive-deps`, `no-unused-vars`, and legacy require-import patterns.

**Risk:** even with successful build, lint signal-to-noise is very poor; this increases chance of defects and can mask high-severity issues.

### 2) Search/card reliability

- Public restaurant feed route (`/api/restaurants`) returns ranked-by-score records from `locations` and filters visibility with `isPublicSearchVisible`.
- Search scoring logic is deterministic but simplistic and can heavily penalize distance (`200 - distanceMiles*80`) which may over-dominant ranking in dense metros.
- `app/explore/page.tsx` currently renders **static placeholder cards** (`{[1,2,3,4]...}`) per section, not live search-backed cards.

**Risk:** user-facing “explore” cards are not tied to live inventory/search quality, so reliability of search vs cards can diverge.

### 3) Route security

- `proxy.ts` applies only rate limiting; no authn/authz checks there (expected for middleware, but important context).
- Role guard helper exists (`requireAdminApiRole`) and checks session user + `admin_users` + metadata fallback.
- However, at least one sensitive admin route (`/api/admin/search`) directly creates a service-role Supabase client from env and does not call `requireAdminApiRole`.

**Risk:** if route exposure/path discovery occurs, sensitive search across users/locations could be queried without robust role enforcement at handler level.

### 4) Environment variables

- Env-variable usage is broad and distributed (Supabase, Stripe, Twilio, OpenAI, Google APIs, secrets for cron/import/admin).
- Critical clients commonly use non-null assertion (`process.env.FOO!`) without centralized startup validation (`lib/supabase-admin.ts`, various route-local initializers).
- Some keys are validated lazily (good example: `lib/stripe/server.ts` throws if missing secret), but this pattern is inconsistent.

**Risk:** deployment misconfiguration may fail at runtime under specific routes instead of failing fast on startup.

### 5) Stripe webhooks

- `/api/stripe/webhook` checks only for presence of `stripe-signature` header but **does not** verify event with Stripe signing secret.
- Route parses arbitrary JSON (`await request.json()`), then applies business updates based on event type and metadata.

**Risk (critical):** forged webhook requests can mutate subscription/reservation/payment status if attacker can hit endpoint with crafted payload.

### 6) Reservation double-booking

- Slot lock endpoint exists and checks availability before writing `reservation_slot_locks`.
- Reservation create endpoint re-checks availability and overlap before insert, then writes reservation and deletes lock rows.
- This is good defense-in-depth, but not atomic: concurrent requests can pass checks before either insert commits unless DB-level exclusion/unique constraints or transaction-guarded RPC exists.

**Risk (high during traffic spikes):** race-condition double booking for same item/time window remains possible.

## Priority remediation plan

### P0 (immediate)
1. **Fix Stripe webhook verification**
   - Read raw request body.
   - Verify using Stripe SDK `constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
   - Reject invalid signatures before any DB writes.
2. **Enforce authz on every admin API route**
   - Add `requireAdminApiRole(...)` guard at start of `/api/admin/*` handlers.
   - Remove route-local direct service-role clients where not absolutely required.
3. **Make reservation booking atomic at DB layer**
   - Implement Postgres transaction/RPC with row lock or exclusion constraint strategy.
   - Ensure single commit path performs availability + insert atomically.

### P1 (next)
4. Add centralized env validation module (startup fail-fast).
5. Reduce lint debt to meaningful baseline (target: <25 errors short-term).
6. Replace explore placeholder cards with API-backed cards and add fallbacks/empty-state behavior.

### P2 (hardening)
7. Add idempotency protections for webhook event IDs.
8. Add load/concurrency tests for reservation booking race scenarios.
9. Add security tests ensuring admin endpoints return 401/403 without proper session/role.

## Commands executed

- `npm run build`
- `npm run lint`
- Targeted source inspection via `sed` and `rg` on: webhook, reservation, search, admin-auth, middleware, and env usage.
