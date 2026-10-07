import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const service = read("lib/pos/payments/check-payment-service.ts");
const route = read("app/api/business/pos/checks/[checkId]/payments/route.ts");
const isolated = read("apps/business/app/api/business/pos/checks/[checkId]/payments/route.ts");
const migration = read("supabase/migrations/20261005102000_pos_atomic_card_tender.sql").toLowerCase();
const hardening = read("infra/supabase/operational-shards/hardening-v2.sql").toLowerCase();
const partialTenders = read("infra/supabase/operational-shards/partial-tenders-v8.sql").toLowerCase();
const contracts = read("lib/pos/payments/contracts.ts");
const stripe = read("lib/pos/payments/stripe.ts");

for (const token of [
  '"pos_begin_card_tender"',
  '"pos_begin_partial_card_tender"',
  "shardclient.rpc(rpcname,args)",
  "stripe_connect_account_id",
  "stripe_connect_charges_enabled",
  "getpospaymentprovider",
  "idempotencykey",
  '.from("pos_payments")',
  "resolveoperationalshardforlocationid",
  "cancelpaymentintent",
]) {
  if (!service.toLowerCase().includes(token.toLowerCase())) throw new Error(`Missing POS payment service invariant: ${token}`);
}

if (!service.includes('requestedAmount===null?"pos_begin_card_tender":"pos_begin_partial_card_tender"')) {
  throw new Error("POS payment service must select the full or partial atomic tender RPC server-side.");
}
for (const [name, sql] of [["full", hardening], ["partial", partialTenders]]) {
  if (!sql.includes("t.amount_cents") || !sql.includes("t.amount_refunded_cents") || !sql.includes("max(t.tender_number)")) {
    throw new Error(`Operational ${name} tender RPC must qualify tender columns to avoid PL/pgSQL output-column ambiguity.`);
  }
}
if (route.includes("amount_cents") || route.includes("amountCents")) {
  throw new Error("POS payment route must not accept a client-supplied charge amount.");
}
for (const token of ["createCheckCardPayment", "requireOwnerOrAdminAccessToLocation", "pos_payment_in_progress"]) {
  if (!isolated.includes(token)) throw new Error(`Business isolated POS payment route parity is missing: ${token}`);
}
for (const token of ["for update", "pos_check_not_payable", "pos_check_already_paid", "pos_payment_in_progress", "status = 'initiated'", "security invoker", "grant execute"]) {
  if (!migration.includes(token)) throw new Error(`Missing atomic POS tender invariant: ${token}`);
}
if (!contracts.includes("cancelPaymentIntent")) throw new Error("POS provider contract must support PaymentIntent cancellation.");
if (!stripe.includes("/cancel") || !stripe.includes("cancellation_reason") || !contracts.includes('reason?: "duplicate"')) {
  throw new Error("Stripe POS adapter must cancel orphaned PaymentIntents through the provider boundary.");
}
if (service.includes('import { supabaseAdmin }')) throw new Error("POS payment service must not bind tenant writes to the global Supabase admin client.");
if (!service.includes("pos_payment_persistence_failed_cancel_unconfirmed")) {
  throw new Error("POS service must surface an unconfirmed cancellation after persistence failure.");
}

console.log("POS payment service regression passed.");
