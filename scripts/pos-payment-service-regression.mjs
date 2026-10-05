import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const service = read("lib/pos/payments/check-payment-service.ts");
const route = read("app/api/business/pos/checks/[checkId]/payments/route.ts");
const isolated = read("apps/business/app/api/business/pos/checks/[checkId]/payments/route.ts");
const migration = read("supabase/migrations/20261005102000_pos_atomic_card_tender.sql").toLowerCase();

for (const token of [
  'rpc("pos_begin_card_tender"',
  "stripe_connect_account_id",
  "stripe_connect_charges_enabled",
  "getpospaymentprovider",
  "idempotencykey",
  '.from("pos_payments")',
]) {
  if (!service.toLowerCase().includes(token.toLowerCase())) throw new Error(`Missing POS payment service invariant: ${token}`);
}

if (route.includes("amount_cents") || route.includes("amountCents")) {
  throw new Error("POS payment route must not accept a client-supplied charge amount.");
}
if (!isolated.includes("export { POST, dynamic }")) {
  throw new Error("Business isolated POS payment route parity is missing.");
}
for (const token of ["for update", "pos_check_not_payable", "pos_check_already_paid", "security invoker", "grant execute"]) {
  if (!migration.includes(token)) throw new Error(`Missing atomic POS tender invariant: ${token}`);
}

console.log("POS payment service regression passed.");
