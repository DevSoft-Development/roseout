import "server-only";

import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createLocationNotificationEvent } from "@/lib/growth-pro/notifications";
import { sendGrowthProEmail } from "@/lib/growth-pro/email";
import { getSiteUrl, getStripeModeForLocation, stripeRequest } from "@/lib/stripe/server";

export type LeadPaymentKind = "deposit" | "balance";
export type LeadActor = {
  userId?: string | null;
  email?: string | null;
  type?: "business" | "admin" | "customer" | "system";
};

function text(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function cleanCurrency(value: unknown) {
  const raw = text(value, 3).toLowerCase();
  return /^[a-z]{3}$/.test(raw) ? raw : "usd";
}

export function hashLeadContractToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signatureDigest(input: {
  leadId: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
}) {
  return crypto
    .createHash("sha256")
    .update([input.leadId, input.signerName, input.signerEmail.toLowerCase(), input.signedAt, "accepted"].join("|"))
    .digest("hex");
}

export async function getLeadById(leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("location_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getLeadLocation(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,metadata,is_demo,demo_key,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function recordLeadEvent(input: {
  leadId: string;
  locationId: string;
  eventType: string;
  actor?: LeadActor;
  fromStage?: string | null;
  toStage?: string | null;
  amountCents?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("location_lead_events").insert({
    lead_id: input.leadId,
    location_id: input.locationId,
    event_type: input.eventType,
    actor_user_id: input.actor?.userId || null,
    actor_email: input.actor?.email || null,
    actor_type: input.actor?.type || "system",
    from_stage: input.fromStage || null,
    to_stage: input.toStage || null,
    amount_cents: input.amountCents == null ? null : cents(input.amountCents),
    metadata: input.metadata || {},
  });
  if (error) throw error;
}

async function updateWithVersion(lead: any, patch: Record<string, unknown>) {
  const currentVersion = Math.max(1, Number(lead.commercial_version || 1));
  const { data, error } = await supabaseAdmin
    .from("location_leads")
    .update({
      ...patch,
      commercial_version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id)
    .eq("commercial_version", currentVersion)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This lead changed after it was opened. Refresh and try again.");
  return data;
}

export async function saveLeadCommercialPlan(
  leadId: string,
  input: Record<string, unknown>,
  actor: LeadActor = { type: "business" },
) {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");

  const subtotal = cents(input.quote_subtotal_cents);
  const tax = cents(input.quote_tax_cents);
  const total = cents(input.quote_total_cents || subtotal + tax);
  const deposit = cents(input.deposit_required_cents);
  if (deposit > total) throw new Error("Deposit cannot exceed the quote total.");

  const proposalPayload = input.proposal_payload && typeof input.proposal_payload === "object"
    ? input.proposal_payload as Record<string, unknown>
    : {};
  const contractPayload = input.contract_payload && typeof input.contract_payload === "object"
    ? input.contract_payload as Record<string, unknown>
    : {};

  const next = await updateWithVersion(lead, {
    lead_type: ["private_event", "catering"].includes(text(input.lead_type, 40)) ? text(input.lead_type, 40) : lead.lead_type || "private_event",
    occasion: text(input.occasion, 160) || lead.occasion || null,
    event_date: text(input.event_date, 20) || lead.event_date || null,
    event_time: text(input.event_time, 40) || lead.event_time || null,
    guest_count: Number.isFinite(Number(input.guest_count)) ? Math.max(1, Math.round(Number(input.guest_count))) : lead.guest_count,
    budget_range: text(input.budget_range, 120) || lead.budget_range || null,
    food_needs: text(input.food_needs, 2000) || lead.food_needs || null,
    drink_needs: text(input.drink_needs, 2000) || lead.drink_needs || null,
    private_room_needed: input.private_room_needed === true || input.private_room_needed === "true" || input.private_room_needed === "on",
    package_interest: text(input.package_interest, 240) || lead.package_interest || null,
    notes: text(input.notes, 6000) || lead.notes || null,
    proposal_payload: proposalPayload,
    contract_payload: contractPayload,
    quote_subtotal_cents: subtotal,
    quote_tax_cents: tax,
    quote_total_cents: total,
    currency: cleanCurrency(input.currency || lead.currency),
    deposit_required_cents: deposit,
    deposit_status: deposit > 0 && cents(lead.deposit_paid_cents) < deposit ? "required" : deposit > 0 ? lead.deposit_status : "not_required",
    balance_due_cents: Math.max(0, total - deposit),
    balance_status: total - deposit > 0 && cents(lead.balance_paid_cents) < total - deposit ? "not_due" : total - deposit > 0 ? lead.balance_status : "not_due",
    proposal_status: lead.proposal_status === "sent" ? "sent" : "draft",
    commercial_stage: ["contract", "deposit_pending", "confirmed", "balance_pending", "completed", "lost"].includes(String(lead.commercial_stage || ""))
      ? lead.commercial_stage
      : "proposal",
  });

  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: "commercial_plan_saved",
    actor,
    fromStage: lead.commercial_stage,
    toStage: next.commercial_stage,
    amountCents: total,
    metadata: { lead_type: next.lead_type, package_interest: next.package_interest },
  });
  return next;
}

export async function sendLeadProposal(leadId: string, actor: LeadActor = { type: "business" }) {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  const now = new Date().toISOString();
  const next = await updateWithVersion(lead, {
    proposal_status: "sent",
    proposal_sent_at: now,
    commercial_stage: "proposal",
    status: "proposal",
  });
  const location = await getLeadLocation(lead.location_id);
  await sendGrowthProEmail(lead.customer_email, "user_event_lead_confirmation", {
    subject: `${location?.name || "TheOutHaven"} event proposal`,
    heading: lead.lead_type === "catering" ? "Your catering proposal" : "Your private event proposal",
    intro: "Your proposal is ready. The venue will send the agreement when the details are finalized.",
    locationName: location?.name || null,
    date: lead.event_date || null,
    time: lead.event_time || null,
    partySize: lead.guest_count || null,
    items: [
      { label: "Package", value: lead.package_interest || "Custom" },
      { label: "Quote", value: cents(lead.quote_total_cents) ? `$${(cents(lead.quote_total_cents) / 100).toFixed(2)}` : "Pending" },
    ],
  });
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: "proposal_sent",
    actor,
    fromStage: lead.commercial_stage,
    toStage: "proposal",
    amountCents: cents(lead.quote_total_cents),
  });
  return next;
}

export async function issueLeadContract(leadId: string, actor: LeadActor = { type: "business" }) {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (!lead.customer_email) throw new Error("A customer email is required before sending a contract.");
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashLeadContractToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const signUrl = `${getSiteUrl()}/event-contract/${encodeURIComponent(rawToken)}`;
  const next = await updateWithVersion(lead, {
    proposal_status: "sent",
    proposal_sent_at: lead.proposal_sent_at || now.toISOString(),
    contract_status: "sent",
    contract_sent_at: now.toISOString(),
    contract_signature_token_hash: tokenHash,
    contract_signature_expires_at: expiresAt,
    commercial_stage: "contract",
    status: "contract",
  });
  const location = await getLeadLocation(lead.location_id);
  await sendGrowthProEmail(lead.customer_email, "user_event_lead_confirmation", {
    subject: `${location?.name || "TheOutHaven"} event agreement`,
    heading: lead.lead_type === "catering" ? "Review your catering agreement" : "Review your private event agreement",
    intro: "Review the event details and agreement, then sign securely to continue.",
    locationName: location?.name || null,
    date: lead.event_date || null,
    time: lead.event_time || null,
    partySize: lead.guest_count || null,
    cta: { label: "Review & sign agreement", url: signUrl },
    items: [
      { label: "Package", value: lead.package_interest || "Custom" },
      { label: "Quote", value: cents(lead.quote_total_cents) ? `$${(cents(lead.quote_total_cents) / 100).toFixed(2)}` : "Pending" },
      { label: "Deposit", value: cents(lead.deposit_required_cents) ? `$${(cents(lead.deposit_required_cents) / 100).toFixed(2)}` : "No deposit" },
    ],
  });
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: "contract_sent",
    actor,
    fromStage: lead.commercial_stage,
    toStage: "contract",
    amountCents: cents(lead.quote_total_cents),
    metadata: { expires_at: expiresAt },
  });
  return { lead: next, signUrl };
}

export async function getLeadContractByToken(rawToken: string) {
  const tokenHash = hashLeadContractToken(rawToken);
  const { data, error } = await supabaseAdmin
    .from("location_leads")
    .select("*")
    .eq("contract_signature_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const expires = data.contract_signature_expires_at ? new Date(data.contract_signature_expires_at).getTime() : 0;
  if (expires && expires < Date.now() && data.contract_status !== "signed") return null;
  return data;
}

export async function createLeadPaymentCheckout(
  leadId: string,
  kind: LeadPaymentKind,
  options: { returnToken?: string | null; actor?: LeadActor } = {},
) {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.contract_status !== "signed") throw new Error("The agreement must be signed before payment.");
  const amount = kind === "deposit"
    ? Math.max(0, cents(lead.deposit_required_cents) - cents(lead.deposit_paid_cents))
    : Math.max(0, cents(lead.balance_due_cents) - cents(lead.balance_paid_cents));
  if (amount <= 0) throw new Error(kind === "deposit" ? "No deposit is due." : "No balance is due.");

  const location = await getLeadLocation(lead.location_id);
  if (!location?.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) {
    throw new Error("The location must finish TheOutHaven Payments setup before collecting event payments.");
  }

  const siteUrl = getSiteUrl();
  const returnPath = options.returnToken
    ? `/event-contract/${encodeURIComponent(options.returnToken)}`
    : "/";
  const productName = kind === "deposit"
    ? `${lead.lead_type === "catering" ? "Catering" : "Private event"} deposit`
    : `${lead.lead_type === "catering" ? "Catering" : "Private event"} balance`;
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl}${returnPath}?payment=success`,
    cancel_url: `${siteUrl}${returnPath}?payment=cancelled`,
    customer_email: String(lead.customer_email || ""),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": cleanCurrency(lead.currency),
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": productName,
    "payment_intent_data[metadata][type]": "location_lead_payment",
    "payment_intent_data[metadata][lead_id]": lead.id,
    "payment_intent_data[metadata][payment_kind]": kind,
    "payment_intent_data[metadata][location_id]": lead.location_id,
    "payment_intent_data[metadata][lead_type]": lead.lead_type || "private_event",
    "metadata[type]": "location_lead_payment",
    "metadata[lead_id]": lead.id,
    "metadata[payment_kind]": kind,
    "metadata[location_id]": lead.location_id,
    "metadata[lead_type]": lead.lead_type || "private_event",
  });

  const session = await stripeRequest<{ id: string; url: string | null; payment_intent?: string | null }>("/checkout/sessions", {
    body: params,
    idempotencyKey: `location-lead-${kind}-${lead.id}-v${lead.commercial_version || 1}`,
    stripeAccount: String(location.stripe_connect_account_id),
    mode: getStripeModeForLocation(location),
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");

  const patch = kind === "deposit"
    ? {
        deposit_status: "pending",
        deposit_checkout_session_id: session.id,
        deposit_payment_intent_id: session.payment_intent || null,
        commercial_stage: "deposit_pending",
        status: "deposit_pending",
      }
    : {
        balance_status: "pending",
        balance_checkout_session_id: session.id,
        balance_payment_intent_id: session.payment_intent || null,
        commercial_stage: "balance_pending",
        status: "balance_pending",
      };
  const next = await updateWithVersion(lead, patch);
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: `${kind}_checkout_created`,
    actor: options.actor || { type: "customer" },
    fromStage: lead.commercial_stage,
    toStage: next.commercial_stage,
    amountCents: amount,
    metadata: { checkout_session_id: session.id },
  });
  return { checkoutUrl: session.url, amountCents: amount, lead: next };
}

export async function signLeadContract(
  rawToken: string,
  signerName: string,
  signerEmail: string,
) {
  const lead = await getLeadContractByToken(rawToken);
  if (!lead) throw new Error("This agreement link is invalid or expired.");
  if (lead.contract_status === "signed") return { lead, checkoutUrl: null as string | null };
  const name = text(signerName, 160);
  const email = text(signerEmail, 254).toLowerCase();
  if (name.length < 2 || !email.includes("@")) throw new Error("Your name and email are required.");
  if (lead.customer_email && String(lead.customer_email).trim().toLowerCase() !== email) {
    throw new Error("Use the email address this agreement was sent to.");
  }

  const signedAt = new Date().toISOString();
  const noDeposit = cents(lead.deposit_required_cents) <= cents(lead.deposit_paid_cents);
  const next = await updateWithVersion(lead, {
    contract_status: "signed",
    contract_signed_at: signedAt,
    contract_signer_name: name,
    contract_signer_email: email,
    contract_signature_digest: signatureDigest({ leadId: lead.id, signerName: name, signerEmail: email, signedAt }),
    commercial_stage: noDeposit ? "confirmed" : "deposit_pending",
    status: noDeposit ? "confirmed" : "deposit_pending",
    confirmed_at: noDeposit ? signedAt : lead.confirmed_at || null,
  });
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: "contract_signed",
    actor: { type: "customer", email },
    fromStage: lead.commercial_stage,
    toStage: next.commercial_stage,
    amountCents: cents(lead.quote_total_cents),
  });
  await createLocationNotificationEvent({
    locationId: lead.location_id,
    eventType: "private_event_contract_signed",
    title: lead.lead_type === "catering" ? "Catering agreement signed" : "Private event agreement signed",
    message: `${name} signed the agreement.`,
    priority: "high",
    metadata: { leadId: lead.id, leadType: lead.lead_type },
  });

  if (!noDeposit) {
    const payment = await createLeadPaymentCheckout(lead.id, "deposit", {
      returnToken: rawToken,
      actor: { type: "customer", email },
    });
    return { lead: payment.lead, checkoutUrl: payment.checkoutUrl };
  }
  return { lead: next, checkoutUrl: null as string | null };
}

export async function sendLeadBalancePaymentLink(leadId: string, actor: LeadActor = { type: "business" }) {
  const payment = await createLeadPaymentCheckout(leadId, "balance", { actor });
  const lead = payment.lead;
  const location = await getLeadLocation(lead.location_id);
  await sendGrowthProEmail(lead.customer_email, "user_event_lead_confirmation", {
    subject: `${location?.name || "TheOutHaven"} event balance`,
    heading: "Final payment is ready",
    intro: "Your event balance is ready for secure payment.",
    locationName: location?.name || null,
    cta: { label: "Pay event balance", url: payment.checkoutUrl },
    items: [{ label: "Amount due", value: `$${(payment.amountCents / 100).toFixed(2)}` }],
  });
  return payment;
}

export async function settleLeadCheckoutPayment(input: {
  leadId: string;
  kind: LeadPaymentKind;
  amountCents: number;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
}) {
  const lead = await getLeadById(input.leadId);
  if (!lead) throw new Error("Lead not found for payment.");
  const amount = cents(input.amountCents);
  const now = new Date().toISOString();
  const patch = input.kind === "deposit"
    ? {
        deposit_paid_cents: Math.max(cents(lead.deposit_paid_cents), amount),
        deposit_status: "paid",
        deposit_payment_intent_id: input.paymentIntentId || lead.deposit_payment_intent_id || null,
        deposit_checkout_session_id: input.checkoutSessionId || lead.deposit_checkout_session_id || null,
        deposit_paid_at: now,
        commercial_stage: "confirmed",
        status: "confirmed",
        confirmed_at: lead.confirmed_at || now,
      }
    : {
        balance_paid_cents: Math.max(cents(lead.balance_paid_cents), amount),
        balance_status: "paid",
        balance_payment_intent_id: input.paymentIntentId || lead.balance_payment_intent_id || null,
        balance_checkout_session_id: input.checkoutSessionId || lead.balance_checkout_session_id || null,
        balance_paid_at: now,
        commercial_stage: "confirmed",
        status: "confirmed",
        confirmed_at: lead.confirmed_at || now,
      };
  const next = await updateWithVersion(lead, patch);
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: `${input.kind}_paid`,
    actor: { type: "system" },
    fromStage: lead.commercial_stage,
    toStage: next.commercial_stage,
    amountCents: amount,
    metadata: { payment_intent_id: input.paymentIntentId || null, checkout_session_id: input.checkoutSessionId || null },
  });
  await createLocationNotificationEvent({
    locationId: lead.location_id,
    eventType: input.kind === "deposit" ? "private_event_deposit_paid" : "private_event_balance_paid",
    title: input.kind === "deposit" ? "Event deposit paid" : "Event balance paid",
    message: `${lead.customer_name || "Customer"} paid ${input.kind === "deposit" ? "the deposit" : "the final balance"}.`,
    priority: "high",
    metadata: { leadId: lead.id, amountCents: amount, leadType: lead.lead_type },
  });
  return next;
}

export async function failLeadCheckoutPayment(leadId: string, kind: LeadPaymentKind, reason: string) {
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  const patch = kind === "deposit"
    ? { deposit_status: "failed", commercial_stage: "deposit_pending", status: "deposit_pending" }
    : { balance_status: "failed", commercial_stage: "balance_pending", status: "balance_pending" };
  const next = await updateWithVersion(lead, patch);
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: `${kind}_payment_failed`,
    actor: { type: "system" },
    fromStage: lead.commercial_stage,
    toStage: next.commercial_stage,
    metadata: { reason },
  });
  return next;
}

export async function completeLead(leadId: string, actor: LeadActor = { type: "business" }) {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.contract_status !== "signed") throw new Error("Signed agreement required before completing an event.");
  const now = new Date().toISOString();
  const next = await updateWithVersion(lead, {
    commercial_stage: "completed",
    status: "completed",
    completed_at: now,
  });
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: "event_completed",
    actor,
    fromStage: lead.commercial_stage,
    toStage: "completed",
    amountCents: cents(lead.deposit_paid_cents) + cents(lead.balance_paid_cents),
  });
  return next;
}

export async function loseLead(leadId: string, actor: LeadActor = { type: "business" }) {
  const lead = await getLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");
  const next = await updateWithVersion(lead, {
    commercial_stage: "lost",
    status: "lost",
  });
  await recordLeadEvent({
    leadId: lead.id,
    locationId: lead.location_id,
    eventType: "lead_lost",
    actor,
    fromStage: lead.commercial_stage,
    toStage: "lost",
  });
  return next;
}
