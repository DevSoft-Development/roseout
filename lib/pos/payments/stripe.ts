import "server-only";

import type {
  CreatePosPaymentIntentInput,
  PosPaymentIntent,
  PosPaymentIntentStatus,
  PosPaymentProvider,
} from "@/lib/pos/payments/contracts";
import { validateCreatePosPaymentIntentInput } from "@/lib/pos/payments/validation";
import { stripeRequest, type StripeMode } from "@/lib/stripe/server";

type StripePaymentIntentResponse = {
  id: string;
  amount: number;
  currency: string;
  status?: string;
  client_secret?: string | null;
};

function normalizeStripePaymentIntentStatus(value: unknown): PosPaymentIntentStatus {
  switch (String(value || "")) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
    case "requires_capture":
    case "succeeded":
    case "canceled":
      return String(value) as PosPaymentIntentStatus;
    default:
      return "unknown";
  }
}

function appendMetadata(form: URLSearchParams, metadata: Record<string, string | number | boolean | null | undefined>) {
  for (const [key, raw] of Object.entries(metadata)) {
    if (!key.trim() || raw === null || raw === undefined) continue;
    form.set(`metadata[${key}]`, String(raw));
  }
}

export function buildStripeDirectChargePaymentIntentForm(input: CreatePosPaymentIntentInput) {
  const validated = validateCreatePosPaymentIntentInput(input);
  const form = new URLSearchParams({
    amount: String(validated.amountCents),
    currency: validated.currency,
    "automatic_payment_methods[enabled]": "true",
    "metadata[type]": "pos_payment",
    "metadata[platform]": "theouthaven",
    "metadata[location_id]": validated.locationId,
    "metadata[check_id]": validated.checkId,
    "metadata[tip_cents]": String(validated.tipCents),
  });

  if (validated.applicationFeeCents > 0) {
    form.set("application_fee_amount", String(validated.applicationFeeCents));
  }
  if (validated.orderId) form.set("metadata[order_id]", validated.orderId);
  if (validated.reservationId) form.set("metadata[reservation_id]", validated.reservationId);
  if (validated.customerId) form.set("metadata[customer_id]", validated.customerId);
  if (validated.employeeId) form.set("metadata[employee_id]", validated.employeeId);
  if (validated.paymentMethodType) form.set("metadata[payment_method_type]", validated.paymentMethodType);
  appendMetadata(form, validated.metadata || {});

  return form;
}

export class StripePosPaymentProvider implements PosPaymentProvider {
  readonly id = "stripe" as const;

  constructor(private readonly mode: StripeMode) {}

  async createPaymentIntent(input: CreatePosPaymentIntentInput): Promise<PosPaymentIntent> {
    const validated = validateCreatePosPaymentIntentInput(input);
    const paymentIntent = await stripeRequest<StripePaymentIntentResponse>("/payment_intents", {
      method: "POST",
      mode: this.mode,
      stripeAccount: validated.connectedAccountId,
      idempotencyKey: validated.idempotencyKey,
      body: buildStripeDirectChargePaymentIntentForm(validated),
    });

    return {
      provider: "stripe",
      providerPaymentIntentId: paymentIntent.id,
      connectedAccountId: validated.connectedAccountId,
      amountCents: Number(paymentIntent.amount || validated.amountCents),
      currency: String(paymentIntent.currency || validated.currency).toLowerCase(),
      status: normalizeStripePaymentIntentStatus(paymentIntent.status),
      clientSecret: paymentIntent.client_secret || null,
    };
  }
}
