import { describe, expect, it } from "vitest";
import { buildStripeDirectChargePaymentIntentForm } from "@/lib/pos/payments/stripe";
import { validateCreatePosPaymentIntentInput } from "@/lib/pos/payments/validation";

const baseInput = {
  locationId: "loc_123",
  connectedAccountId: "acct_123",
  amountCents: 12500,
  currency: "USD",
  checkId: "check_123",
  orderId: "order_123",
  reservationId: "res_123",
  customerId: "customer_123",
  employeeId: "employee_123",
  tipCents: 2500,
  applicationFeeCents: 300,
  paymentMethodType: "card_present" as const,
  idempotencyKey: "pos-check_123-payment-1",
};

describe("POS Stripe direct-charge foundation", () => {
  it("builds a direct-charge PaymentIntent form without transfer_data or on_behalf_of", () => {
    const form = buildStripeDirectChargePaymentIntentForm(baseInput);
    expect(form.get("amount")).toBe("12500");
    expect(form.get("currency")).toBe("usd");
    expect(form.get("application_fee_amount")).toBe("300");
    expect(form.get("metadata[type]")).toBe("pos_payment");
    expect(form.get("metadata[location_id]")).toBe("loc_123");
    expect(form.get("metadata[check_id]")).toBe("check_123");
    expect(form.get("metadata[tip_cents]")).toBe("2500");
    expect(form.get("transfer_data[destination]")).toBeNull();
    expect(form.get("on_behalf_of")).toBeNull();
  });

  it("requires a positive integer amount and stable idempotency boundary", () => {
    expect(() => validateCreatePosPaymentIntentInput({ ...baseInput, amountCents: 0 })).toThrow("invalid_pos_payment_amount");
    expect(() => validateCreatePosPaymentIntentInput({ ...baseInput, idempotencyKey: "" })).toThrow("missing_pos_payment_idempotency_key");
  });

  it("rejects a platform fee larger than the charge amount", () => {
    expect(() => validateCreatePosPaymentIntentInput({
      ...baseInput,
      amountCents: 100,
      applicationFeeCents: 101,
    })).toThrow("pos_application_fee_exceeds_amount");
  });
});
