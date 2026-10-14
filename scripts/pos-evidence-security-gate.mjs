import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const file=p=>readFileSync(p,"utf8");
const upload=file("apps/business/app/api/pos/evidence/route.ts");
const manager=file("apps/business/app/api/pos/evidence/packet/route.ts");
const evidence=file("lib/pos/payments/transaction-evidence.ts");
const session=file("lib/pos/payments/customer-evidence-session.ts");
const audit=file("lib/pos/payments/evidence-access-audit.ts");

// Never treat owner authorization alone as customer signature authorization.
assert.match(upload,/customer_signature_session_required/);
assert.doesNotMatch(upload,/storeVerifiedPosSignature\s*\(/);
assert.match(manager,/auditPosEvidenceAccess/);
assert.match(manager,/ownedLocationIds\.includes\(locationId\)/);
assert.match(evidence,/pos_evidence_unverified_payment/);
assert.match(evidence,/pos_evidence_tender_not_eligible/);
assert.match(session,/timingSafeEqual/);
assert.match(session,/120_000/);
assert.match(audit,/pos_evidence_audit_unavailable/);
console.log("PASS: legacy signature endpoint disabled; tenant scoped metadata; audited export prerequisites");
console.log("BLOCKED: full customer-session issuance, one-use upload, production shard provisioning, signed PDFs and physical Stripe device test must be independently certified.");
