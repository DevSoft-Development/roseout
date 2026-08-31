# Oregon DR Auth continuity

This runbook defines how TheOutHaven decides whether Supabase Auth sessions can survive a Virginia → Oregon DR promotion.

## Current verified state — 2026-08-31

The live diagnostic currently returns:

- Auth row parity: `true`
- asymmetric Virginia signing trust covered by Oregon: `false`
- legacy JWT cross-project trust: `false`
- existing Virginia access-token continuity: `false`
- Oregon Microsoft admin re-login path ready: `true`
- Oregon customer email/password re-login path ready: `true`
- promotion session strategy: `reauthentication_required`

Current matched Auth inventory is 5 users, 6 sessions, 6 active refresh tokens, 1 Azure identity, and 5 email identities in each project.

Therefore a Virginia → Oregon promotion must not promise transparent preservation of already-issued Virginia access tokens. Customers and administrators must be prepared to authenticate again. Existing customer password hashes and identities are preserved, and the Oregon Microsoft OAuth start path is healthy.

Do not change or rotate production signing keys merely to remove this re-login requirement as part of a DR cutover. Any future shared-signing-key strategy must be a separate, reversible security change with its own rollout and validation.

## Safety model

Virginia remains the writable production primary. Oregon remains passive. This diagnostic is read-only: it does not mint, refresh, revoke, consume, or delete any user session or refresh token, and it does not switch application traffic.

## What must match

The workflow `.github/workflows/oregon-dr-auth-continuity.yml` verifies:

- exact Virginia/Oregon fingerprints for `auth.users`, `auth.sessions`, `auth.refresh_tokens`, and `auth.identities`;
- portable Auth/session configuration parity;
- Microsoft/Azure provider readiness on Oregon;
- customer email/password provider readiness on Oregon;
- asymmetric signing-key trust coverage using public JWK fingerprints;
- legacy JWT trust using a bidirectional, read-only cross-project PostgREST signature probe with the public legacy `anon` JWTs.

The legacy probe deliberately uses the target project's `apikey` and the other project's public `anon` JWT only as the bearer token. A 200 response proves the target PostgREST stack accepts the other project's legacy JWT signature. No privileged key is used for the cross-project probe.

## Promotion session strategies

### `existing_access_tokens_trusted`

Oregon has cryptographic trust for every currently accepted Virginia signing path covered by the diagnostic. Existing access-token continuity is proven at the signing layer.

The final promotion still requires exact Auth row parity immediately before cutover.

### `reauthentication_required`

Virginia-issued access tokens are not fully trusted by Oregon. Auth rows, password hashes, identities, sessions, and refresh-token rows may still be in exact parity, but that does not make an already-issued Virginia JWT valid against Oregon.

Promotion is still technically possible, but the cutover plan must treat customer and admin reauthentication as expected behavior. Do not advertise transparent session continuity.

For customers, password hashes are part of the exact `auth.users` fingerprint, so migrated users retain their existing password credentials when the Auth provider is enabled.

For administrators, Oregon must successfully start the Azure/Microsoft OAuth flow and redirect to Microsoft before Oregon can be considered re-login ready.

## Important distinction

Supabase logical/database Auth row parity and JWT signing trust are separate concerns. Copying `auth.*` rows does not copy project signing material. A DR promotion must evaluate both.

## Promotion checklist

Before any explicit Oregon promotion:

1. Run `Oregon DR Auth continuity` from `main` and record the session strategy.
2. Run the final Auth reconciler after Virginia writes are quiesced.
3. Re-run the Auth continuity diagnostic.
4. If the strategy is `reauthentication_required`, ensure the cutover UX and operator plan expect customer/admin sign-in again.
5. Confirm Oregon Microsoft admin OAuth start is healthy.
6. Confirm Oregon customer email/password Auth is enabled.
7. Continue with the sequence-safe final promotion preflight.

This runbook does not itself promote Oregon, detach logical replication, or change signing keys.
