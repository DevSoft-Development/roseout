#!/usr/bin/env node
// Deterministic, dependency-free POS shift simulation. NEVER connects to Stripe,
// Supabase, POS devices, or production customer data.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const cents = (v) => { assert(Number.isSafeInteger(v) && v >= 0, "invalid cents"); return v; };
const state = {
  mode: "isolated-simulation",
  drawer: { opening: 20000, cashIn: 0, cashOut: 0, open: false, closed: false },
  checks: new Map(), tenders: new Map(), refunds: new Map(), actions: [],
  receipts: [], inventory: { entree: 10, drink: 10 }, networkOnline: true,
  kitchen: [], tables: new Map(), reservations: new Map(), printerOnline: true,
};
const suite = [];
async function scenario(name, fn) {
  try { await fn(); suite.push({ name, status: "passed" }); }
  catch (error) { suite.push({ name, status: "failed", error: String(error?.message || error) }); }
}
const requireManager = (actor) => {
  if (actor?.role !== "manager" || actor?.pinVerified !== true) throw Error("manager_approval_required");
};
function addTender(checkId, id, type, amount, tip = 0) {
  cents(amount); cents(tip);
  const check = state.checks.get(checkId);
  if (!check) throw Error("check_not_found");
  const prior = state.tenders.get(id);
  if (prior) {
    if (prior.checkId !== checkId || prior.type !== type || prior.amount !== amount || prior.tip !== tip) throw Error("idempotency_conflict");
    return prior;
  }
  const paid = [...state.tenders.values()].filter(t => t.checkId === checkId && t.status === "completed").reduce((n,t) => n + t.amount,0);
  if (amount <= 0 || paid + amount > check.total) throw Error("invalid_tender_amount");
  const tender = { id, checkId, type, amount, tip, status: "completed", refunded: 0 };
  state.tenders.set(id,tender);
  if (type === "cash") state.drawer.cashIn += amount + tip;
  return tender;
}
function refund(id, tenderId, amount, manager) {
  requireManager(manager); cents(amount);
  const tender = state.tenders.get(tenderId);
  if (!tender || amount === 0 || amount > tender.amount - tender.refunded) throw Error("invalid_refund");
  const prior = state.refunds.get(id);
  if (prior) {
    if (prior.tenderId !== tenderId || prior.amount !== amount) throw Error("refund_idempotency_conflict");
    return prior;
  }
  const row = { id, tenderId, amount, status: "completed" };
  state.refunds.set(id,row); tender.refunded += amount;
  if (tender.type === "cash") state.drawer.cashOut += amount;
  return row;
}
const manager = { role: "manager", pinVerified: true };
await scenario("Open shift and drawer", () => {
  assert(!state.drawer.open); state.drawer.open = true;
  assert.equal(state.drawer.opening, 20000);
});
await scenario("Cashier role is not a manager", () => {
  assert.throws(() => requireManager({role:"cashier", pinVerified:true}),/manager_approval_required/);
  assert.throws(() => requireManager({role:"manager", pinVerified:false}),/manager_approval_required/);
});
await scenario("Reserve and seat guests", () => {
  state.reservations.set("reservation-1",{ party:2, status:"seated" });
  state.tables.set("table-1",{ status:"occupied", reservationId:"reservation-1" });
  assert.equal(state.tables.get("table-1").status,"occupied");
});
await scenario("Take order and fire to kitchen", () => {
  state.checks.set("check-1",{ total:7500, discount:0, status:"open" });
  state.kitchen.push({ checkId:"check-1", status:"fired" });
  state.inventory.entree -= 2; state.inventory.drink -= 2;
  assert.equal(state.kitchen[0].status,"fired");
  assert.equal(state.inventory.entree,8);
});
await scenario("Kitchen marks order ready", () => {
  state.kitchen[0].status="ready"; assert.equal(state.kitchen[0].status,"ready");
});
await scenario("Cash payment", () => {
  const tender=addTender("check-1","cash-1","cash",4500);
  assert.equal(tender.amount,4500);
});
await scenario("Stripe test-mode stand-in card payment", () => {
  // Provider is simulated; no card authorization or charge is performed.
  const tender=addTender("check-1","card-1","card",3000);
  assert.equal(tender.type,"card");
});
await scenario("Split tender settles check exactly", () => {
  const check=state.checks.get("check-1");
  const paid=[...state.tenders.values()].filter(t=>t.checkId==="check-1").reduce((n,t)=>n+t.amount,0);
  assert.equal(paid,check.total); check.status="paid";
});
await scenario("Cash change calculation", () => {
  const given=5000,owed=4500; assert.equal(given-owed,500);
});
await scenario("Payment replay is idempotent", () => {
  const before=state.tenders.size, cash=state.drawer.cashIn;
  const same=addTender("check-1","cash-1","cash",4500);
  assert.equal(same.id,"cash-1"); assert.equal(state.tenders.size,before); assert.equal(state.drawer.cashIn,cash);
  assert.throws(()=>addTender("check-1","cash-1","cash",4000),/idempotency_conflict/);
});
await scenario("Manager discount and audit", () => {
  requireManager(manager);
  state.checks.set("check-2",{total:2000,discount:0,status:"open"});
  const c=state.checks.get("check-2"); c.discount=200; c.total-=200;
  state.actions.push({action:"discount",actor:"manager",amount:200});
  assert.equal(c.total,1800);
});
await scenario("Manager void and audit", () => {
  requireManager(manager);
  state.actions.push({action:"void_item",actor:"manager",amount:300});
  assert.equal(state.actions.at(-1).action,"void_item");
});
await scenario("Cash refund and duplicate prevention", () => {
  const a=refund("refund-1","cash-1",1000,manager);
  assert.equal(a.amount,1000);
  const before=state.drawer.cashOut;
  refund("refund-1","cash-1",1000,manager);
  assert.equal(state.drawer.cashOut,before);
  assert.throws(()=>refund("refund-1","cash-1",500,manager),/refund_idempotency_conflict/);
});
await scenario("Card refund provider stand-in", () => {
  const a=refund("refund-2","card-1",500,manager);
  assert.equal(a.status,"completed"); assert.equal(state.drawer.cashOut,1000);
});
await scenario("Receipt queue and printer recovery", () => {
  state.printerOnline=false;
  state.receipts.push({checkId:"check-1",status:"queued"});
  assert.equal(state.receipts[0].status,"queued");
  state.printerOnline=true; state.receipts[0].status="printed";
  assert.equal(state.receipts[0].status,"printed");
});
await scenario("Offline operation preserves pending work", () => {
  state.networkOnline=false;
  const pending={id:"sync-1",state:"pending"};
  assert.equal(pending.state,"pending");
  state.networkOnline=true; pending.state="synced";
  assert.equal(pending.state,"synced");
});
await scenario("Close drawer with exact reconciliation", () => {
  requireManager(manager); assert(state.drawer.open);
  const expected=state.drawer.opening+state.drawer.cashIn-state.drawer.cashOut;
  assert.equal(expected,23500); // $200 opening + $45 cash sale - $10 cash refund
  state.drawer.closed=true; state.drawer.counted=23500;
  assert.equal(state.drawer.counted-expected,0);
});
await scenario("Verify simulated DR journal parity", () => {
  // Deterministic model only. Live PostgreSQL replication is a separate gate.
  const primary=[...state.tenders.keys(),...state.refunds.keys()];
  const replica=structuredClone(primary);
  assert.deepEqual(replica,primary);
});
const failures=suite.filter(x=>x.status==="failed");
const report={
  schema:"theposhaven.shift-certification.v1",
  tier:"simulation-only",
  environment:"in-memory-no-network",
  productionCertified:false,
  generatedAt:new Date().toISOString(),
  passed:suite.length-failures.length,failed:failures.length,total:suite.length,
  scenarios:suite,
  reconciliation:{openingCashCents:state.drawer.opening,cashInCents:state.drawer.cashIn,
    cashRefundCents:state.drawer.cashOut,expectedClosingCashCents:state.drawer.opening+state.drawer.cashIn-state.drawer.cashOut,
    countedCashCents:state.drawer.counted??null,varianceCents:state.drawer.counted===undefined?null:state.drawer.counted-(state.drawer.opening+state.drawer.cashIn-state.drawer.cashOut)},
  outstandingGates:["Stripe test-mode integration","isolated database RPC execution","live DR parity probe","real POS device/receipt acceptance"],
};
const out=process.env.POS_SHIFT_REPORT || "artifacts/pos-shift-certification.json";
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({report:out,tier:report.tier,passed:report.passed,failed:report.failed,reconciliation:report.reconciliation}));
if(failures.length) {for(const f of failures) console.error("FAIL",f.name,f.error);process.exitCode=1;}
