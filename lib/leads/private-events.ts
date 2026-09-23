import "server-only";

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export type LocationLeadPaymentKind = "deposit" | "balance";

type LocationLead = Record<string, any>;

const PAID = new Set(["paid", "succeeded", "complete", "completed"]);

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function channelClass(lead: LocationLead) {
  const raw = String(lead.attribution_channel_class || "").toLowerCase();
  if (["organic", "sponsored", "owned", "unknown"].includes(raw)) return raw;
  if (lead.attribution_promotion_campaign_id) return "sponsored";
  if (lead.attribution_search_id) return "organic";
  return "unknown";
}

function paymentColumns(kind: LocationLeadPaymentKind) {
  return kind === "deposit"
    ? {
        amount: "deposit_amount_cents",
        status: "deposit_status",
        checkout: "deposit_checkout_session_id",
        intent: "deposit_payment_intent_id",
        paidAt: "deposit_paid_at",
      }
    : {
        amount: "balance_amount_cents",
        status: "balance_status",
        checkout: "balance_checkout_session_id",
        intent: "balance_payment_intent_id",
        paidAt: "balance_paid_at",
      };
}

async function getLead(leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lead not found.");
  return data as LocationLead;
}

export async function getPublicLocationLead(token: string) {
  const cleanToken = clean(token, 80);
  if (!cleanToken) return null;
  const { data, error } = await supabaseAdmin
    .from("location_leads")
    .select("id,location_id,lead_type,customer_name,customer_email,occasion,event_date,event_time,guest_count,proposal_title,proposal_description,proposal_payload,proposal_amount_cents,proposal_currency,proposal_sent_at,proposal_expires_at,contract_terms,contract_status,contract_sent_at,contract_signed_at,deposit_amount_cents,deposit_status,balance_amount_cents,balance_status,status,public_token,public_token_expires_at")
    .eq("public_token", cleanToken)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.public_token_expires_at && new Date(data.public_token_expires_at).getTime() < Date.now()) return null;
  return data as LocationLead;
}

export async function createLocationLeadPaymentCheckout(input: {
  leadId: string;
  kind: LocationLeadPaymentKind;
}) {
  const lead = await getLead(input.leadId);
  const columns = paymentColumns(input.kind);
  const amountCents = Math.max(0, Number(lead[columns.amount] || 0));
  if (amountCents < 50) throw new Error("Payment amount must be at least $0.50.");
  if (PAID.has(String(lead[columns.status] || "").toLowerCase())) {
    return { alreadyPaid: true, checkoutUrl: null, lead };
  }
  if (input.kind === "deposit" && lead.contract_status !== "signed") {
    throw new Error("The contract must be signed before collecting the deposit.");
  }
  if (input.kind === "balance" && Number(lead.deposit_amount_cents || 0) > 0 && !PAID.has(String(lead.deposit_status || "").toLowerCase())) {
    throw new Error("The deposit must be paid before collecting the final balance.");
  }

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
    .eq("id", lead.location_id)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location) throw new Error("Location not found.");
  if (!location.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) {
    throw new Error("The location must complete TheOutHaven Payments setup before collecting event payments.");
  }

  const siteUrl = getSiteUrl();
  const locationName = String(location.name || location.restaurant_name || location.activity_name || "TheOutHaven location");
  const label = input.kind === "deposit" ? "Private event deposit" : "Private event final balance";
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl}/private-events/${encodeURIComponent(String(lead.public_token))}?payment=${input.kind}_success`,
    cancel_url: `${siteUrl}/private-events/${encodeURIComponent(String(lead.public_token))}?payment=${input.kind}_cancelled`,
    customer_email: String(lead.customer_email || ""),
    integration_identifier: `tohlead-${randomBytes(4).toString("hex")}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": String(lead.proposal_currency || "usd").toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(amountCents),
    "line_items[0][price_data][product_data][name]": `${label} — ${locationName}`,
    "payment_intent_data[metadata][type]": "location_lead_payment",
    "payment_intent_data[metadata][lead_id]": String(lead.id),
    "payment_intent_data[metadata][location_id]": String(lead.location_id),
    "payment_intent_data[metadata][payment_kind]": input.kind,
    "metadata[type]": "location_lead_payment",
    "metadata[lead_id]": String(lead.id),
    "metadata[location_id]": String(lead.location_id),
    "metadata[payment_kind]": input.kind,
  });

  const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
    body: params,
    stripeAccount: String(location.stripe_connect_account_id),
    idempotencyKey: `location-lead-${input.kind}-${lead.id}-${amountCents}`,
  });
  if (!session.url) throw new Error("Unable to create the event payment checkout.");

  const update: Record<string, unknown> = {
    [columns.checkout]: session.id,
    [columns.status]: "pending",
    updated_at: new Date().toISOString(),
  };
  if (input.kind === "deposit") update.status = "deposit_pending";
  else update.status = "balance_pending";
  const { error: updateError } = await supabaseAdmin.from("location_leads").update(update).eq("id", lead.id);
  if (updateError) throw updateError;

  return { alreadyPaid: false, checkoutUrl: session.url, checkoutSessionId: session.id, lead };
}

export async function signLocationLeadContract(input: {
  token: string;
  signerName: string;
  signerEmail: string;
  signatureIpHash?: string | null;
}) {
  const lead = await getPublicLocationLead(input.token);
  if (!lead) throw new Error("This event proposal is unavailable or expired.");
  if (!["sent", "signed"].includes(String(lead.contract_status || ""))) {
    throw new Error("This contract is not ready for signature.");
  }
  const signerName = clean(input.signerName, 160);
  const signerEmail = clean(input.signerEmail, 254).toLowerCase();
  if (!signerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) {
    throw new Error("Enter the signer name and a valid email address.");
  }

  if (lead.contract_status !== "signed") {
    const now = new Date().toISOString();
    const noDeposit = Number(lead.deposit_amount_cents || 0) <= 0;
    const update: Record<string, unknown> = {
      contract_status: "signed",
      contract_signed_at: now,
      contract_signer_name: signerName,
      contract_signer_email: signerEmail,
      contract_signature_ip_hash: input.signatureIpHash || null,
      status: noDeposit ? "confirmed" : "contract_signed",
      updated_at: now,
    };
    if (noDeposit) update.confirmed_at = now;
    const { error } = await supabaseAdmin.from("location_leads").update(update).eq("id", lead.id);
    if (error) throw error;
  }

  const refreshed = await getLead(String(lead.id));
  if (Number(refreshed.deposit_amount_cents || 0) > 0 && !PAID.has(String(refreshed.deposit_status || "").toLowerCase())) {
    const payment = await createLocationLeadPaymentCheckout({ leadId: String(refreshed.id), kind: "deposit" });
    return { lead: refreshed, checkoutUrl: payment.checkoutUrl };
  }
  return { lead: refreshed, checkoutUrl: null };
}

export async function settleLocationLeadPayment(input: {
  leadId: string;
  kind: LocationLeadPaymentKind;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  amountCents?: number | null;
}) {
  const lead = await getLead(input.leadId);
  const columns = paymentColumns(input.kind);
  const amountCents = Math.max(0, Number(input.amountCents ?? lead[columns.amount] ?? 0));
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    [columns.status]: "paid",
    [columns.paidAt]: now,
    updated_at: now,
  };
  if (input.checkoutSessionId) update[columns.checkout] = input.checkoutSessionId;
  if (input.paymentIntentId) update[columns.intent] = input.paymentIntentId;
  if (input.kind === "deposit") {
    update.status = "confirmed";
    update.confirmed_at = lead.confirmed_at || now;
  } else if (lead.status !== "completed") {
    update.status = "confirmed";
  }

  const { error } = await supabaseAdmin.from("location_leads").update(update).eq("id", lead.id);
  if (error) throw error;

  const eventPrefix = String(lead.lead_type || "private_event") === "catering" ? "catering" : "private_event";
  const channel = channelClass(lead);
  const { error: attributionError } = await supabaseAdmin
    .from("marketing_attribution_events")
    .upsert({
      dedupe_key: `location_lead:${lead.id}:payment:${input.kind}`,
      location_id: lead.location_id,
      lead_id: lead.id,
      search_id: lead.attribution_search_id || null,
      promotion_campaign_id: lead.attribution_promotion_campaign_id || null,
      event_type: `${eventPrefix}_${input.kind}_paid`,
      anonymous_id: lead.attribution_anonymous_id || null,
      session_id: lead.attribution_session_id || null,
      source: lead.source || "location_lead",
      channel_class: channel,
      attribution_model: lead.attribution_promotion_campaign_id ? "captured_sponsored_touch" : lead.attribution_search_id ? "captured_search_touch" : "lead_source",
      touchpoint_type: "payment",
      conversion_id: String(lead.id),
      is_conversion: true,
      revenue_cents: amountCents,
      revenue_kind: amountCents > 0 ? "confirmed" : "none",
      currency: String(lead.proposal_currency || "usd").toLowerCase(),
      source_event_id: lead.attribution_source_event_id || null,
      metadata: {
        lead_type: lead.lead_type || "private_event",
        payment_kind: input.kind,
        contract_status: lead.contract_status,
      },
      occurred_at: now,
      updated_at: now,
    }, { onConflict: "dedupe_key" });
  if (attributionError) throw attributionError;

  return { leadId: String(lead.id), amountCents, kind: input.kind };
}

export async function failLocationLeadPayment(input: {
  leadId: string;
  kind: LocationLeadPaymentKind;
}) {
  const columns = paymentColumns(input.kind);
  const { error } = await supabaseAdmin
    .from("location_leads")
    .update({ [columns.status]: "failed", updated_at: new Date().toISOString() })
    .eq("id", input.leadId)
    .neq(columns.status, "paid");
  if (error) throw error;
}
