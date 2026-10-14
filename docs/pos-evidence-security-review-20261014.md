# POS evidence security review - 2026-10-14

Decision: **DO NOT ACTIVATE OR MERGE AS CERTIFIED E2E**.

## Verified repository facts
- The old business-owner session signature POST is fail-closed in #4084; a signed customer token verifier and schema exist but are not wired to trusted-device issuance or single-use capture.
- Metadata history and printable HTML export exist; full signed PDF including original itemized receipt and signature is not implemented.
- Capture service tests shard-local completed tender and succeeded payment row; no independent Stripe connected-account reconciliation.
- Private bucket and append-only event schema are migration files, not evidence that shard-01/shard-02 are migrated, bucket encrypted and secure, or DR parity achieved.
- Access audit is wired for successful printable-manifest exports, not all reads, denied exports, signature uploads and downloads.

## Release-blocking implementation acceptance criteria
1. **Trusted device**: Authenticate a provisioned POS device and physical customer-screen session, authorize it to a specific location/check/tender, bind nonce and expiry to server-side record; create no public issuance endpoint.
2. **Payment verification**: Reconcile connected-account Stripe PaymentIntent/card-present outcome and amount against immutable tender before session issuance; handle pending, canceled and delayed webhooks.
3. **Single-use capture**: Require bearer token, validate HMAC, context, expiry, origin and device credentials; atomically consume nonce with upload finalization and recover safely after storage failure; resist replay across tenants.
4. **Storage**: Deploy v11-v14 migrations and private buckets on each shard with least privilege, encryption-at-rest verified, object-access audit, deletion/retention/legal-hold plan and isolated DR.
5. **Manager RBAC**: Separate owner/manager view/download permissions; exclude demo handoff; audit list/view/download/denied/export with fail-closed responses and rate limits.
6. **Actual PDF**: Render original itemized receipt, service charges and tips, evidence hashes and only the collected matching signature, without exporting private storage URLs; redact PII and use no-store download.
7. **Gratuity**: Integrate policy quote into actual checkout and Stripe charge atomically, persist consent/disclosure version and use correct NY tax/service-charge rules.
8. **Certification**: Run sandbox connected-account test payments and actual Android/iPad reader taps, split tenders, duplicate/interrupted flow, all with recorded operator and evidence.

## Current gate
Do not set POS_CUSTOMER_SIGNATURE_CAPTURE_ENABLED=true and do not activate live payments. Static tests are not a substitute for E2E certification.
