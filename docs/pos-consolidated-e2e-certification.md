# POS checkout/evidence consolidated PR — certification matrix

This single PR includes customer signature security, Stripe settlement reconciliation, transaction itemization, and later checkout/PDF/UI work.

## Mandatory release constraints

- Both `POS_CUSTOMER_SIGNATURE_DEVICE_SESSIONS_ENABLED` and `POS_SIGNATURE_STRIPE_SETTLEMENT_VERIFICATION_ENABLED` must be unset/false until complete review.
- Stripe reconciliation uses **test mode only** in this branch; it must not be activated for production live accounts.
- One-use nonce is consumed before storing a signature. Upload outages cannot safely retry with the same nonce; this must be addressed before certification.
- Never treat a locally recorded successful tender as independent processor proof.
- Gratuity quote is not yet atomically persisted to checks and tender capture. A preview tip selection is never a real charge.
- HTML manifest itemization is not a genuine signed PDF. Real PDF must include SHA-256 validated private signature blobs, itemized receipts and authenticated audit trail.
- Authenticated TheOutHaven Lounge browser testing must verify demo handoff, owner isolation and failed-authorization cases; CI build alone is not proof.
- Supabase bucket exists on four databases; encryption/KMS configuration, object-level access, retention and backup restore require separate evidence before certification.

## Required E2E cases
1. Cross-location manager denied and customer session token invalid.
2. Token expires after 2 minutes; replay/cross-device session denied.
3. Stripe sandbox intent pending, canceled, incorrect amount, wrong account, wrong metadata all denied.
4. One successful sandbox card-present payment with exact location/check/tender metadata.
5. Owner downloads signed PDF with all lines, totals and signature; failed export is audited.
6. Venue mode restaurant/activity/hybrid gratuity, automatic service charge disclosure and exact tender amount.
7. Both primary and both DR shard schema probes green, write fences unchanged.
8. Authenticated demo browser walkthrough and unauthorized path check.
