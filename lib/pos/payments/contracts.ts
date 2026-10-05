export type PosPaymentProviderId = "stripe";

export type PosPaymentMethodType =
  | "card_present"
  | "card_not_present"
  | "cash"
  | "other";

export type PosPaymentIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "succeeded"
  | "canceled"
  | "unknown";

export type CreatePosPaymentIntentInput = {
  locationId: string;
  connectedAccountId: string;
  amountCents: number;
  currency?: string;
  checkId: string;
  orderId?: string | null;
  reservationId?: string | null;
  customerId?: string | null;
  employeeId?: string | null;
  tipCents?: number;
  applicationFeeCents?: number;
  paymentMethodType?: PosPaymentMethodType;
  idempotencyKey: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type CancelPosPaymentIntentInput = {
  connectedAccountId: string;
  providerPaymentIntentId: string;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer" | "abandoned";
};

export type PosPaymentIntent = {
  provider: PosPaymentProviderId;
  providerPaymentIntentId: string;
  connectedAccountId: string;
  amountCents: number;
  currency: string;
  status: PosPaymentIntentStatus;
  clientSecret: string | null;
};

export interface PosPaymentProvider {
  readonly id: PosPaymentProviderId;
  createPaymentIntent(input: CreatePosPaymentIntentInput): Promise<PosPaymentIntent>;
  cancelPaymentIntent(input: CancelPosPaymentIntentInput): Promise<PosPaymentIntent>;
}
