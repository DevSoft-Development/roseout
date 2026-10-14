import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,it,expect} from "vitest";

const source=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");
const migration=source("infra/supabase/operational-shards/pos-text-to-pay-v18.sql");
const checkout=source("apps/business/app/api/pos/customer/text-to-pay/route.ts");
const issuance=source("apps/business/app/api/pos/customer/text-to-pay/issue/route.ts");
const expire=source("lib/pos/payments/text-to-pay-expiration.ts");
const review=source("apps/business/app/api/pos/disputes/review/route.ts");

describe("Stack A checkout and dispute release guards",()=>{
 it("defines each migration component exactly once with balanced PL/pgSQL delimiters",()=>{
  expect(migration.match(/create table if not exists public.pos_text_to_pay_sessions/gi)?.length).toBe(1);
  expect(migration.match(/create or replace function public.pos_settle_text_to_pay/gi)?.length).toBe(1);
  expect(migration.match(/create or replace function public.pos_text_to_pay_advance/gi)?.length).toBe(1);
  expect(migration.match(/\$\$/g)?.length).toBe(10);
  expect(migration.match(/\bcommit;/gi)?.length).toBe(1);
  expect(migration).not.toMatch(/as \$\s*\n/);
 });
 it("restricts payment RPCs to service role and atomically associates Stripe checkout ID",()=>{
  expect(migration).toContain("checkout_session_id=case when p_to='paying'");
  expect(migration).toContain("grant execute on function public.pos_settle_text_to_pay");
  expect(migration).toContain("to service_role;");
  expect(checkout).toContain("p_checkout_session_id:checkout.id");
  expect(checkout).not.toContain(".update({checkout_session_id:checkout.id})");
 });
 it("uses the Stripe-supported card-only Checkout filter",()=>{
  expect(checkout).toContain('form.set("allowed_payment_method_types[0]","card")');
  expect(checkout).not.toContain('form.set("payment_method_types[0]"');
 });
 it("preserves idempotent settlement and check/tender locking",()=>{
  expect(migration).toContain("if v_s.status='paid' then");
  expect(migration).toContain("for update;");
  expect(migration).toContain("provider_payment_intent_id=p_payment_intent_id");
 });
 it("keeps refunds monotonic and restricted to paid Text-to-Pay sessions",()=>{
  expect(migration).toContain("pos_reconcile_text_to_pay_refund");
  expect(migration).toContain("p_refunded_cents<=v_t.amount_refunded_cents");
  expect(migration).toContain("s.status='paid'");
 });
 it("refuses reopening checkout without independent expired and unpaid Stripe confirmation",()=>{
  expect(expire).toContain('remote.status!=="expired"');
  expect(expire).toContain('remote.payment_status!=="unpaid"');
  expect(expire).toContain('mode:"test"');
  expect(expire).toContain('.eq("status","paying")');
 });
 it("cancels a failed SMS challenge instead of stranding an active link",()=>{
  expect(issuance).toContain('status:"cancelled"');
  expect(issuance).toContain('throw Error("sms_delivery_unavailable")');
 });
 it("binds dispute review to the current evidence digest and acknowledges Stripe first",()=>{
  expect(review).toContain('if(digest!==body.sha256)');
  expect(review.indexOf("const submitted=await stripeRequest")).toBeLessThan(
   review.indexOf('action:"submit"')
  );
 });
});
