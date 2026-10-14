#!/usr/bin/env node
/**
 * CI-safe static certification gate. No simulated payment can satisfy a physical-device test.
 */
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const read=p=>readFileSync(p,"utf8");
const schema="infra/supabase/operational-shards/transaction-evidence-v11.sql";
const capture="apps/business/components/pos/CustomerSignaturePad.tsx";
const service="lib/pos/payments/transaction-evidence.ts";
const packet="lib/pos/payments/dispute-packet.ts";
for(const file of [schema,capture,service,packet])assert.ok(existsSync(file),`Missing ${file}`);
const sql=read(schema),c=read(capture),s=read(service),p=read(packet);
assert.match(sql,/row level security/i);
assert.match(sql,/pos_transaction_evidence_immutable/);
assert.match(sql,/sha256_hex/);
assert.match(c,/onPointerDown/);
assert.match(c,/toBlob/);
assert.doesNotMatch(c,/processPayment|confirmPaymentIntent|createPaymentIntent/);
assert.match(s,/pos_evidence_unverified_payment/);
assert.match(s,/pos_evidence_tender_not_eligible/);
assert.match(s,/pos-transaction-evidence/);
assert.match(p,/renderPrintablePosDisputePacket/);
assert.match(p,/replace\(\/[&<>"']/);
console.log("POS signature/evidence static checks PASS");
console.log("HARDWARE / STRIPE TEST-MODE CERTIFICATION: NOT RUN; BLOCKED pending provisioned staging and physical devices.");
