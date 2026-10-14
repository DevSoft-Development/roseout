# ThePOSHaven transaction signatures and dispute evidence (Select+ / Signature+)

Status: DESIGN AND STORAGE-SCHEMA FOUNDATION ONLY. Not enabled in production.

## Customer-facing workflow
1. Display itemized final amount, taxes, separately disclosed mandatory service charges, optional tips, and total before charging.
2. Process card on certified Stripe reader/Tap to Pay; capture a signature only when supported and appropriately disclosed. Do not require signatures for every contactless transaction.
3. Server links collected signature to the exact location, settled check, tender, Stripe account and PaymentIntent. Never trust client-supplied payment status.
4. Offer digital receipt or requested/required paper receipt. Signature is not proof of payment approval.

## Storage and security
- The pos_transaction_evidence table on each operational shard contains metadata only; never signature pixels or strokes.
- Store binary evidence in encrypted private object storage with non-guessable pos-evidence/ paths and no public URLs.
- Record SHA-256, capture source/time, location/check/tender association and retention date.
- Enforce tenant-scoped manager authorization and audit each view, download, and packet generation.
- Use append-only evidence. No signatures may be reused to authorize later transactions.
- Retention, deletion requests, applicable labor and payment laws and litigation holds require implementation and review.

## Printable dispute packet
- Authorized managers open a settled transaction and request Prepare dispute packet.
- Combine itemized receipt, tip/service disclosures, relevant signature when captured, transaction status, authorization reference, booking/check-in/delivery evidence and communications.
- Preview and redact personal data. Generate printable PDF with evidence identifiers and integrity hashes. Never fabricate missing evidence.
- Audit requestor, location, export time and source hashes. Human review is required before dispute submission.

## Required certification before release
- Promote shard migration with DR parity and migration replay: this SQL file alone is not deployed.
- Implement private object store, authenticated capture/read APIs, role checks, secure signed URLs, export renderer, retention and access audit.
- Validate payment attempt idempotency and ensure collecting evidence cannot authorize or re-charge a card.
- Certify actual Stripe test-mode devices and activity/restaurant/hybrid workflows, split checks and partial payments.
- Enable only after security review and end-to-end proof. Plan inclusion in Select+ and Signature+.
