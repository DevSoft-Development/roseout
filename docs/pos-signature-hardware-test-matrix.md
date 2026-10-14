# ThePOSHaven signature and dispute evidence certification

Status: NOT CERTIFIED. The PRs in this stack are preparatory code, not live payment activation.

## Automated preflight
Run `node scripts/pos-evidence-certification.mjs` to confirm expected static safeguards exist.
This test never marks Stripe payments or physical devices certified.

## Mandatory staging prerequisites
- Staging operational shard v11 and DR migration parity, provision a private and encrypted `pos-transaction-evidence` storage bucket on each active shard.
- Build and security-test authenticated device capture API, location-bound tender verification, manager access, audit logs, retention/legal holds, full itemized receipt renderer and signature export.
- Perform real Stripe sandbox connected-account card_present transactions with webhook verification and idempotency.
- Test with actual supported reader paired to preferred Android tablet and supported iPad configuration. Test with supported Tap to Pay separately.

## Physical acceptance matrix
| Test | Expected result | Status |
| --- | --- | --- |
| Tip -> final amount -> tap -> approved payment | Exact confirmed amount, no extra charges | NOT RUN |
| Declined / canceled tap | No settled tender or signature falsely attached | NOT RUN |
| Network loss between authorization and acknowledgment | Reconcile original PaymentIntent before retry | NOT RUN |
| Double tap / duplicate request | Single settled tender; no duplicate charge | NOT RUN |
| Signature required on a supported screen | Signature linked to correct settled tender | NOT RUN |
| Signature not required | Payment completes without forced signature | NOT RUN |
| Clear/cancel digital signature | No blank or unauthorized evidence saved | NOT RUN |
| Six-seat split check / partial tenders | Each signature isolated to right tender | NOT RUN |
| Restaurant 6+ guest service charge | Correct pre-disclosed rate and no default second tip | NOT RUN |
| Activity booking/waiver/rental | Eligible charges and customer acknowledgment separated | NOT RUN |
| Hybrid activity + food | Correct itemized tax and service charge bases | NOT RUN |
| Manager export other tenant | Access denied and audited | NOT RUN |
| Print evidence and regenerate | Same referenced data and hashes | NOT RUN |
| Retention/legal hold | Compliant expiration without invalid deletion | NOT RUN |
| Offline mode | No unsupported offline payment claims | NOT RUN |

## Release decision
All mandatory tests require recorded operator, device model/firmware, date, connected account sandbox context, expected/observed results and approved reviewer.
Do not enable live card charging until tests, security review, and payment reconciliation are green.
