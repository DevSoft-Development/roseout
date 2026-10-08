import "server-only";

import type {
  CancelPosPaymentIntentInput,
  CreatePosPaymentIntentInput,
  PosPaymentIntent,
  PosPaymentIntentStatus,
  PosPaymentProvider,
  PosPaymentRefund,
  RefundPosPaymentIntentInput,
  PosRefund,
  PosRefundStatus,
  RefundPosPaymentIntentInput,
} from "@/lib/pos/payments/contracts";
import { validateCreatePosPaymentIntentInput } from "@/lib/pos/payments/validation";
import { stripeRequest, type StripeMode } from "@/lib/stripe/server";

type StripeRefundResponse = {
  id: string;
  amount: number;
  payment_intent?: string | null;
  status?: string | null;
};

type StripeRefundResponse = {
  id: string;
  amount: number;
  payment_intent?: string | null;
  status?: string | null;
};

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

function normalizeStripeRefundStatus(value: unknown): PosRefundStatus {
  switch (String(value || "")) {
    case "pending":
    case "succeeded":
    case "failed":
    case "canceled":
      return String(value) as PosRefundStatus;
    default:
      return "unknown";
  }
}

function toPosPaymentIntent(paymentIntent: StripePaymentIntentResponse, connectedAccountId: string, fallbackAmount = 0, fallbackCurrency = "usd"): PosPaymentIntent {
  return {
    provider: "stripe",
    providerPaymentIntentId: paymentIntent.id,
    connectedAccountId,
    amountCents: Number(paymentIntent.amount || fallbackAmount),
    currency: String(paymentIntent.currency || fallbackCurrency).toLowerCase(),
    status: normalizeStripePaymentIntentStatus(paymentIntent.status),
    clientSecret: paymentIntent.client_secret || null,
  };
}

function normalizeStripeRefundStatus(value: unknown): PosPaymentRefund["status"] {
  switch (String(value || "")) {
    case "pending":
    case "succeeded":
    case "failed":
    case "canceled":
      return String(value) as PosPaymentRefund["status"];
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

    return toPosPaymentIntent(paymentIntent, validated.connectedAccountId, validated.amountCents, validated.currency);
  }

  async refundPaymentIntent(input: RefundPosPaymentIntentInput): Promise<PosRefund> {
    const connectedAccountId = String(input.connectedAccountId || "").trim();
    const providerPaymentIntentId = String(input.providerPaymentIntentId || "").trim();
    const amountCents = Number(input.amountCents || 0);
    if (!connectedAccountId) throw new Error("missing_connected_account_id");
    if (!providerPaymentIntentId) throw new Error("missing_provider_payment_intent_id");
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("invalid_pos_refund_amount");

    const body = new URLSearchParams({
      payment_intent: providerPaymentIntentId,
      amount: String(amountCents),
    });
    appendMetadata(body, input.metadata || {});

    const refund = await stripeRequest<StripeRefundResponse>("/refunds", {
      method: "POST",
      mode: this.mode,
      stripeAccount: connectedAccountId,
      idempotencyKey: input.idempotencyKey,
      body,
    });

    return {
      provider: "stripe",
      providerRefundId: String(refund.id || ""),
      providerPaymentIntentId: String(refund.payment_intent || providerPaymentIntentId),
      connectedAccountId,
      amountCents: Number(refund.amount || amountCents),
      status: normalizeStripeRefundStatus(refund.status),
    };
  }

  async refundPaymentIntent(input: RefundPosPaymentIntentInput): Promise<PosPaymentRefund> {
    const connectedAccountId = String(input.connectedAccountId || "").trim();
    const providerPaymentIntentId = String(input.providerPaymentIntentId || "").trim();
    const amountCents = Number(input.amountCents);
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (!connectedAccountId) throw new Error("missing_connected_account_id");
    if (!providerPaymentIntentId) throw new Error("missing_provider_payment_intent_id");
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("invalid_pos_refund_amount");
    if (!idempotencyKey) throw new Error("missing_pos_refund_idempotency_key");

    const body = new URLSearchParams({
      payment_intent: providerPaymentIntentId,
      amount: String(amountCents),
    });
    appendMetadata(body, input.metadata || {});

    const refund = await stripeRequest<StripeRefundResponse>("/refunds", {
      method: "POST",
      mode: this.mode,
      stripeAccount: connectedAccountId,
      idempotencyKey,
      body,
    });

    return {
      provider: "stripe",
      providerRefundId: String(refund.id || ""),
      providerPaymentIntentId: String(refund.payment_intent || providerPaymentIntentId),
      connectedAccountId,
      amountCents: Number(refund.amount || amountCents),
      status: normalizeStripeRefundStatus(refund.status),
    };
  }

  async cancelPaymentIntent(input: CancelPosPaymentIntentInput): Promise<PosPaymentIntent> {
    const connectedAccountId = String(input.connectedAccountId || "").trim();
    const providerPaymentIntentId = String(input.providerPaymentIntentId || "").trim();
    if (!connectedAccountId) throw new Error("missing_connected_account_id");
    if (!providerPaymentIntentId) throw new Error("missing_provider_payment_intent_id");

    const body = new URLSearchParams();
    if (input.reason) body.set("cancellation_reason", input.reason);

    const paymentIntent = await stripeRequest<StripePaymentIntentResponse>(
      `/payment_intents/${encodeURIComponent(providerPaymentIntentId)}/cancel`,
      {
        method: "POST",
        mode: this.mode,
        stripeAccount: connectedAccountId,
        body,
      },
    );

    return toPosPaymentIntent(paymentIntent, connectedAccountId);
  }
}
