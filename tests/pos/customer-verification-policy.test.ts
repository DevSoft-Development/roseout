import {describe,it,expect} from "vitest";
import {chooseCheckoutVerification,DEFAULT_VERIFICATION_POLICY} from "../../lib/pos/payments/customer-verification-policy";

describe("optional high-value customer verification",()=>{
 const enabled={...DEFAULT_VERIFICATION_POLICY,enabled:true};
 it("defaults to normal checkout, even above the QR threshold",()=>{
  expect(chooseCheckoutVerification(250000,DEFAULT_VERIFICATION_POLICY)).toBe("standard");
 });
 it("preserves exact threshold boundaries",()=>{
  expect(chooseCheckoutVerification(24999,enabled)).toBe("standard");
  expect(chooseCheckoutVerification(25000,enabled)).toBe("customer_screen");
  expect(chooseCheckoutVerification(99999,enabled)).toBe("customer_screen");
  expect(chooseCheckoutVerification(100000,enabled)).toBe("qr");
 });
 it("uses actual integer cents, never decimals or negative amounts",()=>{
  for(const cents of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])expect(()=>chooseCheckoutVerification(cents,enabled)).toThrow("invalid_payment_total");
 });
 it("rejects reversed thresholds",()=>{
  expect(()=>chooseCheckoutVerification(100000,{enabled:true,qrThresholdCents:5000,customerScreenThresholdCents:10000})).toThrow("invalid_verification_policy");
 });
});
