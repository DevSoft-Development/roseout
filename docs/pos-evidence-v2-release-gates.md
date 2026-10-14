# POS evidence V2 rollout / certification gates

## Actual status
All V2 PRs are preliminary and must stay behind capability flags. PR merges and CI success do **not** constitute Stripe test-mode, physical card-reader, encryption, privacy or legal certification.

## Required before signature API is enabled
1. Confirm owner-only policies do not prevent authorized managers, while preventing staff of unrelated tenants. Exclude demo handoff and impersonation.
2. Provision non-public encrypted `pos-transaction-evidence` buckets on each active operational shard, deploy evidence schema v11 and gratuity policy schema v12 with disaster-recovery parity.
3. Verify tender status, actual provider settled status, immutable total and correct Stripe account/payment intent with webhook reconciliation. Check whether the underlying tender schema and payment statuses match each environment.
4. Add capture authorization bound to a real customer-facing post-payment session (not just an authenticated owner browser), CSRF hardening, payload rate limits, detailed access logs, and data retention/legal holds.
5. Implement complete itemized receipts and signature-image inclusion in redacted printable PDFs. Current /api/pos/evidence/packet only serves a printable metadata manifest.
6. Build manager history UI and role-specific secure signature viewing; current history is an API read model.
7. Implement per-location gratuity manager UI, consistent checkout pricing, tax/service-charge treatment, consent/disclosures and automatic-gratuity split math; v12 is schema only.
8. Independently review storage lifecycle, signature privacy, retention rules and tenant isolation.

## Real Stripe sandbox and physical-device test evidence
| Scenario | Pass requirement | Current |
|---|---|---|
| Test-mode card_present checkout on connected Stripe account | Confirm actual PaymentIntent, tender and correct amount | NOT RUN |
| Android tablet + selected $59 reader | Tip -> final amount -> reader tap -> optional signature -> receipt | NOT RUN |
| Supported iPad and supported Tap to Pay | Device-specific capability and signature collection verification | NOT RUN |
| Interrupted network / duplicate tap | No double charge; reconcile payment intent | NOT RUN |
| Multiple checks and partial tenders | Signatures and amounts bound to correct tender | NOT RUN |
| Restaurant automatic gratuity | Disclosed, correct and no accidental extra default tip | NOT RUN |
| Activity and hybrid transactions | Eligible services/food calculation and receipts | NOT RUN |
| Manager access + cross-tenant access | Authorized export works; unauthorized denied and audited | NOT RUN |
| Full dispute packet | Itemized receipt, optional signature, provider facts, hash manifest and secure printable PDF | NOT RUN |
| Shard failover / retention | No missing or exposed evidence | NOT RUN |

Live payments and customer signature collection must not be enabled until all applicable tests are completed and documented. Test equipment needs an operator and real hardware; repository automation cannot physically tap a card or sign a screen.
