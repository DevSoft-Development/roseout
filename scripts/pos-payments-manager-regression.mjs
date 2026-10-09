import fs from "node:fs";
import path from "node:path";

const read=(file)=>fs.readFileSync(path.join(process.cwd(),file),"utf8");
const sql=read("infra/supabase/operational-shards/payments-manager-v10.sql").toLowerCase();
const contracts=read("lib/pos/payments/contracts.ts");
const stripe=read("lib/pos/payments/stripe.ts");
const service=read("lib/pos/payments/manager-service.ts");
const approval=read("lib/pos/manager-approval.ts");
const route=read("app/api/pos/device/manager/route.ts");
const commands=read("lib/pos/device-command-service.ts");
const dispatcher=read("pos-mobile/lib/device/command-dispatcher.ts");
const cloud=read("pos-mobile/lib/device/cloud.ts");
const tables=read("pos-mobile/components/TableServiceWorkspace.tsx");
const signature=read("pos-mobile/components/SignaturePlusWorkspace.tsx");
const bootstrap=read(".github/workflows/operational-shard-live-bootstrap.yml");
const dr=read(".github/workflows/operational-shard-dr-replication.yml");

for(const token of [
  "create table if not exists public.pos_manager_events",
  "create table if not exists public.pos_cash_drawer_sessions",
  "create table if not exists public.pos_refund_requests",
  "public.pos_record_cash_tender",
  "public.pos_apply_check_discount",
  "public.pos_void_order_item",
  "public.pos_begin_tender_refund",
  "public.pos_finalize_tender_refund",
  "public.pos_open_cash_drawer_session",
  "public.pos_close_cash_drawer_session",
  "security invoker",
  "grant execute",
  "values (10,'20261007_pos_payments_manager_v10'",
]) {
  if(!sql.includes(token)) throw new Error("Stack 9 SQL invariant missing: "+token);
}
if(sql.includes("\ndo $\nbegin")||sql.includes("\nend $;")){
  throw new Error("Stack 9 publication block has a malformed dollar quote.");
}
for(const table of ["pos_manager_events","pos_cash_drawer_sessions","pos_refund_requests"]){
  if(!sql.includes("alter table public."+table+" enable row level security")){
    throw new Error("Stack 9 RLS missing for "+table);
  }
  if(!sql.includes("revoke all on table public."+table+" from public, anon, authenticated")){
    throw new Error("Stack 9 public table grant hardening missing for "+table);
  }
}
for(const token of [
  "pos_refund_idempotency_conflict",
  "pos_refund_retry_requires_new_idempotency_key",
  "for update",
  "cash_change_cents",
  "over_short_cents",
]){
  if(!sql.includes(token)) throw new Error("Stack 9 atomic/accounting invariant missing: "+token);
}

for(const token of ["refundPaymentIntent","RefundPosPaymentIntentInput","PosPaymentRefund"]){
  if(!contracts.includes(token)) throw new Error("Refund provider contract missing: "+token);
}
for(const token of ['"/refunds"',"payment_intent","idempotencyKey","stripeAccount: connectedAccountId"]){
  if(!stripe.includes(token)) throw new Error("Stripe refund invariant missing: "+token);
}
for(const token of [
  '"pos_begin_tender_refund"',
  '"pos_finalize_tender_refund"',
  '"pos_fail_tender_refund"',
  "refundPaymentIntent",
  "providerMayHaveAccepted",
  '"pos_cash_drawer_open"',
  '"pos_receipt_print"',
  "queuePosCheckReceipt",
]){
  if(!service.includes(token)) throw new Error("Payment manager service invariant missing: "+token);
}

for(const token of [
  'String(manager.role || "") !== "manager"',
  '"reserve_verify_staff_pin"',
  "pos_manager_pin_invalid",
]){
  if(!approval.includes(token)) throw new Error("Manager PIN approval invariant missing: "+token);
}
for(const token of [
  "verifyPosManagerApproval",
  "managerStaffProfileId",
  "managerPin",
  'action==="refund_tender"',
  'action==="discount_check"',
  'action==="void_item"',
  'action==="close_drawer"',
  'action==="receipt_reprint"',
]){
  if(!route.includes(token)) throw new Error("POS manager route invariant missing: "+token);
}
if(route.includes("approverStaffProfileId:String(body.")){
  throw new Error("POS manager route must not trust a client-supplied approver ID.");
}

for(const token of ['"pos_cash_drawer_open"','"pos_receipt_print"']){
  if(!commands.includes(token)) throw new Error("Device command contract missing: "+token);
  if(!dispatcher.includes(token)) throw new Error("Mobile dispatcher missing: "+token);
}
if(!dispatcher.includes("openCashDrawer()")||!dispatcher.includes('"receipt"')){
  throw new Error("Mobile runtime must route drawer and receipt output through hardware routing.");
}

for(const token of [
  "managerStaffProfileId",
  "managerPin",
  "refundPosManagerTender",
  "applyPosManagerDiscount",
  "voidPosManagerItem",
  "closePosDrawerSession",
  "reprintPosReceipt",
]){
  if(!cloud.includes(token)) throw new Error("Mobile manager API helper missing: "+token);
}
for(const [name,ui] of [["Essentials+",tables],["Signature+",signature]]){
  for(const token of [
    "recordPosCashTender",
    "refundPosManagerTender",
    "applyPosManagerDiscount",
    "voidPosManagerItem",
    "closePosDrawerSession",
    "managerPin",
    "reprintPosReceipt",
  ]){
    if(!ui.includes(token)) throw new Error(name+" manager/payment parity missing: "+token);
  }
}

for(const workflow of [bootstrap,dr]){
  for(const token of ["payments-manager-v10.sql","pos_manager_events","pos_cash_drawer_sessions","pos_refund_requests"]){
    if(!workflow.includes(token)) throw new Error("Shard v10 workflow invariant missing: "+token);
  }
}
if(!bootstrap.includes("schema_version=10")||!dr.includes("schema_version>=10")){
  throw new Error("Operational shard registry must require schema v10.");
}

console.log("ThePOSHaven Stack 9 payment + manager controls verified.");
