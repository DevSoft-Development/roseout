import "server-only";

import { getOperationalShardClientForLocation } from "@/lib/operational-shards";
import { getPosPaymentProvider } from "@/lib/pos/payments/provider";
import type { PosPaymentIntent } from "@/lib/pos/payments/contracts";
import { getStripeModeForLocation } from "@/lib/stripe/server";

type BeginTenderRow = {
  tender_id: string;
  tender_number: number;
  amount_cents: number;
  tip_cents: number;
  charge_total_cents: number;
  currency: string;
};

export type CreateCheckCardPaymentInput = {
  location: Record<string, any>;
  checkId: string;
  tipCents?: number;
  staffProfileId?: string | null;
};

export async function createCheckCardPayment(input: CreateCheckCardPaymentInput) {
  const locationId = String(input.location.id || "").trim();
  const connectedAccountId = String(input.location.stripe_connect_account_id || "").trim();
  if (!locationId) throw new Error("missing_pos_location_id");
  if (!input.checkId.trim()) throw new Error("missing_pos_check_id");
  if (!connectedAccountId) throw new Error("pos_stripe_connect_not_configured");
  if (input.location.stripe_connect_charges_enabled !== true) throw new Error("pos_stripe_connect_charges_not_enabled");

  const shardClient = getOperationalShardClientForLocation(input.location, "write");

  const tipCents = Number(input.tipCents || 0);
  if (!Number.isInteger(tipCents) || tipCents < 0) throw new Error("invalid_pos_tip_amount");

  const { data, error } = await shardClient.rpc("pos_begin_card_tender", {
    p_location_id: locationId,
    p_check_id: input.checkId,
    p_tip_cents: tipCents,
    p_staff_profile_id: input.staffProfileId || null,
  });
  if (error) throw new Error(error.message || "pos_tender_reservation_failed");

  const tender = (Array.isArray(data) ? data[0] : data) as BeginTenderRow | null;
  if (!tender?.tender_id) throw new Error("pos_tender_reservation_failed");

  const provider = getPosPaymentProvider({
    provider: "stripe",
    stripeMode: getStripeModeForLocation(input.location),
  });

  const idempotencyKey = `pos-check-${input.checkId}-tender-${tender.tender_number}`;
  let paymentIntent: PosPaymentIntent | null = null;

  try {
    paymentIntent = await provider.createPaymentIntent({
      locationId,
      connectedAccountId,
      checkId: input.checkId,
      amountCents: Number(tender.charge_total_cents),
      currency: tender.currency,
      tipCents: Number(tender.tip_cents),
      paymentMethodType: "card_present",
      idempotencyKey,
      metadata: {
        tender_id: tender.tender_id,
        tender_number: tender.tender_number,
      },
    });

    const { error: insertError } = await shardClient.from("pos_payments").insert({
      location_id: locationId,
      check_id: input.checkId,
      tender_id: tender.tender_id,
      provider: paymentIntent.provider,
      provider_payment_intent_id: paymentIntent.providerPaymentIntentId,
      connected_account_id: paymentIntent.connectedAccountId,
      idempotency_key: idempotencyKey,
      status: paymentIntent.status === "unknown" ? "created" : paymentIntent.status,
      amount_cents: paymentIntent.amountCents,
      tip_cents: Number(tender.tip_cents),
      application_fee_cents: 0,
      payment_method_type: "card_present",
      metadata: {
        tender_number: tender.tender_number,
        amount_semantics: "processor_charge_total_including_tip",
      },
    });

    if (insertError) throw insertError;

    return {
      check_id: input.checkId,
      tender_id: tender.tender_id,
      tender_number: tender.tender_number,
      base_amount_cents: Number(tender.amount_cents),
      tip_cents: Number(tender.tip_cents),
      charge_total_cents: Number(tender.charge_total_cents),
      currency: tender.currency,
      payment: paymentIntent,
    };
  } catch (error) {
    let cancellationError: string | null = null;
    if (paymentIntent) {
      try {
        await provider.cancelPaymentIntent({
          connectedAccountId,
          providerPaymentIntentId: paymentIntent.providerPaymentIntentId,
          reason: "abandoned",
        });
      } catch (cancelError) {
        cancellationError = cancelError instanceof Error ? cancelError.message : "pos_payment_intent_cancel_failed";
      }
    }

    await shardClient
      .from("pos_tenders")
      .update({
        status: "voided",
        voided_at: new Date().toISOString(),
        metadata: {
          failure: error instanceof Error ? error.message : "payment_intent_create_failed",
          provider_payment_intent_id: paymentIntent?.providerPaymentIntentId || null,
          cancellation_error: cancellationError,
        },
      })
      .eq("id", tender.tender_id)
      .eq("status", "initiated");

    if (cancellationError) {
      throw new Error("pos_payment_persistence_failed_cancel_unconfirmed");
    }
    throw error;
  }
}
