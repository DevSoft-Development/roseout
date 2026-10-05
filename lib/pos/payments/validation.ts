import type { CreatePosPaymentIntentInput } from "@/lib/pos/payments/contracts";

export function normalizePosCurrency(value: string | undefined) {
  const currency = String(value || "usd").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) throw new Error("invalid_pos_payment_currency");
  return currency;
}

export function validateCreatePosPaymentIntentInput(input: CreatePosPaymentIntentInput) {
  if (!input.locationId.trim()) throw new Error("missing_pos_location_id");
  if (!input.connectedAccountId.trim()) throw new Error("missing_pos_connected_account_id");
  if (!input.checkId.trim()) throw new Error("missing_pos_check_id");
  if (!input.idempotencyKey.trim()) throw new Error("missing_pos_payment_idempotency_key");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error("invalid_pos_payment_amount");
  if (!Number.isInteger(input.tipCents || 0) || (input.tipCents || 0) < 0) throw new Error("invalid_pos_tip_amount");
  if (!Number.isInteger(input.applicationFeeCents || 0) || (input.applicationFeeCents || 0) < 0) throw new Error("invalid_pos_application_fee_amount");
  if ((input.applicationFeeCents || 0) > input.amountCents) throw new Error("pos_application_fee_exceeds_amount");
  return {
    ...input,
    currency: normalizePosCurrency(input.currency),
    tipCents: input.tipCents || 0,
    applicationFeeCents: input.applicationFeeCents || 0,
  };
}
