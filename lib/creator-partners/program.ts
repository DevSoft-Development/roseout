import "server-only";

import { randomUUID } from "crypto";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { getSiteUrl, stripeRequest, stripeV2Request } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const CREATOR_REFERRAL_COOKIE = "toh_creator_ref";
export const CREATOR_REFERRAL_DAYS = 90;
export const CREATOR_VALIDATION_DAYS = 14;
export const CREATOR_DEFAULT_COMMISSION_CENTS = 9900;

type CreatorRow = {
  id: string;
  creator_key: string;
  display_name: string;
  slug?: string | null;
  email?: string | null;
  user_id?: string | null;
  referral_code?: string | null;
  referral_window_days?: number | null;
  commission_amount_cents?: number | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_account_api_version?: string | null;
  stripe_connect_onboarding_status?: string | null;
  stripe_connect_payouts_enabled?: boolean | null;
  application_status?: string | null;
  status?: string | null;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_-]/g, "");
}

export function creatorSlug(value: string) {
  return normalizeKey(value).replace(/_+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function creatorReferralCookieValue(creator: Pick<CreatorRow, "creator_key" | "referral_code">) {
  return encodeURIComponent(String(creator.referral_code || creator.creator_key));
}

export async function findCreatorByKey(value: string): Promise<CreatorRow | null> {
  const key = normalizeKey(decodeURIComponent(value || ""));
  if (!key) return null;
  const { data, error } = await supabaseAdmin
    .from("gtm_creator_sources")
    .select("id,creator_key,display_name,slug,email,user_id,referral_code,referral_window_days,commission_amount_cents,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,application_status,status")
    .or(`creator_key.eq.${key},slug.eq.${key},referral_code.eq.${key}`)
    .eq("status", "active")
    .eq("application_status", "approved")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as CreatorRow | null;
}

export async function findCreatorForUser(userId: string, email?: string | null): Promise<CreatorRow | null> {
  const fields = "id,creator_key,display_name,slug,email,user_id,referral_code,referral_window_days,commission_amount_cents,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,application_status,status";
  const { data: byUser, error: userError } = await supabaseAdmin.from("gtm_creator_sources").select(fields).eq("user_id", userId).maybeSingle();
  if (userError) throw userError;
  if (byUser) return byUser as CreatorRow;
  if (!email) return null;
  const { data: byEmail, error: emailError } = await supabaseAdmin.from("gtm_creator_sources").select(fields).eq("email", email.toLowerCase()).maybeSingle();
  if (emailError) throw emailError;
  if (!byEmail) return null;
  if (!byEmail.user_id) await supabaseAdmin.from("gtm_creator_sources").update({ user_id: userId, updated_at: new Date().toISOString() }).eq("id", byEmail.id).is("user_id", null);
  return { ...byEmail, user_id: userId } as CreatorRow;
}

export async function createCreatorApplication(input: {
  displayName: string; email: string; phone?: string; instagram?: string; tiktok?: string; youtube?: string;
  followerCount?: number | null; primaryMarket?: string; niches?: string[]; businessRelationships?: string; userId?: string | null;
}) {
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  if (!displayName || !email || !email.includes("@")) throw new Error("Please enter your name and a valid email address.");
  const baseKey = creatorSlug(input.instagram || input.tiktok || displayName) || `creator-${randomUUID().slice(0, 8)}`;
  const referralCode = `${baseKey.replace(/-/g, "").slice(0, 26).toUpperCase()}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const { data: existing, error: existingError } = await supabaseAdmin.from("gtm_creator_sources").select("id,application_status").eq("email", email).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return { id: String(existing.id), existing: true, status: existing.application_status };
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("gtm_creator_sources").insert({
    creator_key: `${baseKey}-${randomUUID().slice(0, 6)}`,
    display_name: displayName,
    slug: `${baseKey}-${randomUUID().slice(0, 4)}`,
    email,
    phone: input.phone?.trim() || null,
    instagram_handle: normalizeKey(input.instagram || "") || null,
    tiktok_handle: normalizeKey(input.tiktok || "") || null,
    youtube_url: input.youtube?.trim() || null,
    follower_count: Number.isFinite(input.followerCount) ? Math.max(0, Number(input.followerCount)) : null,
    primary_market: input.primaryMarket?.trim() || null,
    niches: (input.niches || []).map((value) => String(value).trim()).filter(Boolean).slice(0, 12),
    user_id: input.userId || null,
    application_status: "applied",
    program_tier: "creator_partner",
    referral_code: referralCode,
    referral_window_days: CREATOR_REFERRAL_DAYS,
    commission_amount_cents: CREATOR_DEFAULT_COMMISSION_CENTS,
    status: "inactive",
    metadata: { source: "creator_application", applied_at: now, business_relationships: input.businessRelationships?.trim().slice(0, 3000) || null },
  }).select("id").single();
  if (error) throw error;
  await Promise.allSettled([
    sendRawBrandedEmail({ to: email, department: "account", subject: "We received your Creator Partner application", heading: "Thanks for applying to TheOutHaven Creator Partners", body: "We received your application. If approved, you’ll get your own referral link, creator dashboard, and the ability to earn $99 for each new business you refer that becomes an Essentials+ customer.", cta: { label: "Learn about Creator Partners", url: `${getSiteUrl()}/creators` } }),
    sendRawBrandedEmail({ to: process.env.ADMIN_NOTIFY_EMAIL || "admin@theouthaven.com", department: "admin", subject: `Creator Partner application: ${displayName}`, heading: "New Creator Partner application", body: `${displayName} applied to the Creator Partner program. Review the application in Marketing → Creator Partners.`, cta: { label: "Review creator", url: `${getSiteUrl()}/admin/dashboard/marketing/creator-partners` } }),
  ]);
  return { id: String(data.id), existing: false, status: "applied" };
}

export async function approveCreator(creatorId: string, tier: "creator_partner" | "featured_creator" | "founding_creator" = "creator_partner") {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("gtm_creator_sources").update({ application_status: "approved", status: "active", program_tier: tier, approved_at: now, updated_at: now }).eq("id", creatorId).select("id,creator_key,display_name,email,slug,referral_code").single();
  if (error) throw error;
  if (data.email) await sendRawBrandedEmail({ to: data.email, department: "account", subject: "You’re approved as a TheOutHaven Creator Partner", heading: "Welcome to TheOutHaven Creator Partners", body: "Your creator partnership is approved. You can now share your referral link and earn $99 when a new business you refer becomes a paying Essentials+ customer. Complete payout setup before your first commission is released.", cta: { label: "Open creator dashboard", url: `${getSiteUrl()}/creator/dashboard` } });
  return data;
}

export async function attachCreatorReferral(input: { creatorToken: string; locationId: string; sourceUrl?: string | null }) {
  const creator = await findCreatorByKey(input.creatorToken);
  if (!creator) return null;
  const now = new Date();
  const { data: existing, error: existingError } = await supabaseAdmin.from("gtm_referrals").select("id,creator_source_id,status,expires_at,referral_key").eq("referred_location_id", input.locationId).in("status", ["referred", "engaged", "claimed", "paid"]).gte("expires_at", now.toISOString()).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing;
  const referralKey = `creator:${normalizeKey(creator.creator_key)}:${input.locationId}:${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + Number(creator.referral_window_days || CREATOR_REFERRAL_DAYS) * 86400000).toISOString();
  const { data, error } = await supabaseAdmin.from("gtm_referrals").insert({ referral_key: referralKey, creator_source_id: creator.id, referred_location_id: input.locationId, status: "referred", first_touch_at: now.toISOString(), expires_at: expiresAt, source_url: input.sourceUrl || null, metadata: { source: "creator_partner", creator_key: creator.creator_key } }).select("id,referral_key,creator_source_id,status,expires_at").single();
  if (error) throw error;
  await Promise.all([
    supabaseAdmin.from("gtm_events").insert({ location_id: input.locationId, event_type: "creator_referral_attached", channel: "creator_partner", source: creator.creator_key, creator_key: creator.creator_key, referral_key: referralKey, metadata: { creator_source_id: creator.id, source_url: input.sourceUrl || null }, occurred_at: now.toISOString() }),
    supabaseAdmin.from("gtm_creator_sources").update({ last_activity_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", creator.id),
  ]);
  return data;
}

export async function markReferralClaimed(locationId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("gtm_referrals").update({ status: "claimed", claimed_at: now, updated_at: now }).eq("referred_location_id", locationId).in("status", ["referred", "engaged"]).gte("expires_at", now).select("id,creator_source_id,referral_key");
  if (error) throw error;
  return data || [];
}

export async function createCreatorCommissionFromPaidInvoice(input: { locationId: string; invoiceId: string; chargeId?: string | null; customerId?: string | null; subscriptionId?: string | null; paidAt?: string }) {
  const paidAt = input.paidAt || new Date().toISOString();
  const { data: referral, error: referralError } = await supabaseAdmin.from("gtm_referrals").select("id,creator_source_id,expires_at,status,referral_key").eq("referred_location_id", input.locationId).in("status", ["referred", "engaged", "claimed", "paid"]).gte("expires_at", paidAt).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (referralError) throw referralError;
  if (!referral?.id || !referral.creator_source_id) return null;
  const { data: creator, error: creatorError } = await supabaseAdmin.from("gtm_creator_sources").select("id,commission_amount_cents,email,application_status,status").eq("id", referral.creator_source_id).maybeSingle();
  if (creatorError) throw creatorError;
  if (!creator || creator.application_status !== "approved" || creator.status !== "active") return null;
  const amountCents = Number(creator.commission_amount_cents || CREATOR_DEFAULT_COMMISSION_CENTS);
  const validationEndsAt = new Date(new Date(paidAt).getTime() + CREATOR_VALIDATION_DAYS * 86400000).toISOString();
  const { data: commission, error: commissionError } = await supabaseAdmin.from("creator_partner_commissions").upsert({ creator_source_id: creator.id, referral_id: referral.id, location_id: input.locationId, amount_cents: amountCents, currency: "usd", status: "validating", stripe_invoice_id: input.invoiceId, stripe_charge_id: input.chargeId || null, qualifying_payment_at: paidAt, validation_ends_at: validationEndsAt, metadata: { stripe_customer_id: input.customerId || null, stripe_subscription_id: input.subscriptionId || null }, updated_at: new Date().toISOString() }, { onConflict: "referral_id", ignoreDuplicates: true }).select("id,status,amount_cents,validation_ends_at").maybeSingle();
  if (commissionError) throw commissionError;
  await supabaseAdmin.from("gtm_referrals").update({ status: "paid", paid_at: paidAt, converted_at: paidAt, attributed_mrr: 99, stripe_customer_id: input.customerId || null, stripe_subscription_id: input.subscriptionId || null, updated_at: new Date().toISOString() }).eq("id", referral.id);
  if (commission && creator.email) await sendRawBrandedEmail({ to: creator.email, department: "account", subject: "$99 creator commission is validating", heading: "A business you referred joined Essentials+", body: `Your $${(amountCents / 100).toFixed(0)} commission is now in the ${CREATOR_VALIDATION_DAYS}-day validation period. If the subscription stays eligible, it will move automatically to payout.`, cta: { label: "View earnings", url: `${getSiteUrl()}/creator/dashboard` } });
  return commission;
}

export async function reverseValidatingCommissionForLocation(locationId: string, reason: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("creator_partner_commissions").update({ status: "reversed", reversed_at: now, reversal_reason: reason, updated_at: now }).eq("location_id", locationId).eq("status", "validating").gt("validation_ends_at", now).select("id,creator_source_id,amount_cents");
  if (error) throw error;
  return data || [];
}

export async function createCreatorRecipientAccount(creator: Pick<CreatorRow, "id" | "display_name" | "email">) {
  return stripeV2Request<{ id: string }>("/core/accounts", { idempotencyKey: `creator-recipient-v2-${creator.id}`, body: { contact_email: creator.email || undefined, display_name: creator.display_name, dashboard: "express", identity: { country: "us" }, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } }, defaults: { currency: "usd", locales: ["en-US"], responsibilities: { fees_collector: "application", losses_collector: "application" } }, metadata: { creator_source_id: creator.id, platform: "theouthaven", program: "creator_partner" }, include: ["configuration.recipient", "requirements"] } });
}

export async function createCreatorOnboardingLink(creator: CreatorRow) {
  if (!creator.stripe_connect_account_id) throw new Error("Payout account has not been created yet.");
  const siteUrl = getSiteUrl();
  return stripeV2Request<{ url: string }>("/core/account_links", { body: { account: creator.stripe_connect_account_id, use_case: { type: "account_onboarding", account_onboarding: { collection_options: { fields: "eventually_due" }, configurations: ["recipient"], refresh_url: `${siteUrl}/api/creators/stripe-connect/onboard?refresh=1`, return_url: `${siteUrl}/api/creators/stripe-connect/return` } } } });
}

export async function refreshCreatorConnectStatus(creator: CreatorRow) {
  if (!creator.stripe_connect_account_id) return { ready: false, status: "not_started", transferStatus: "" };
  const account = await stripeV2Request<any>(`/core/accounts/${encodeURIComponent(creator.stripe_connect_account_id)}?include[]=configuration.recipient&include[]=requirements`, { method: "GET" });
  const transferStatus = String(account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status || "");
  const ready = transferStatus === "active";
  const status = ready ? "ready" : ["restricted", "requirements_past_due"].includes(transferStatus) ? "restricted" : "pending";
  await supabaseAdmin.from("gtm_creator_sources").update({ stripe_connect_onboarding_status: status, stripe_connect_payouts_enabled: ready, updated_at: new Date().toISOString() }).eq("id", creator.id);
  return { ready, status, transferStatus };
}

export async function processCreatorCommissions(limit = 100) {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin.from("creator_partner_commissions").select("id,creator_source_id,referral_id,location_id,amount_cents,currency,status,validation_ends_at,stripe_transfer_id").in("status", ["validating", "approved", "payable"]).lte("validation_ends_at", now).order("validation_ends_at", { ascending: true }).limit(Math.max(1, Math.min(limit, 250)));
  if (error) throw error;
  const summary = { checked: 0, approved: 0, paid: 0, reversed: 0, needsReview: 0 };
  for (const commission of rows || []) {
    summary.checked += 1;
    const { data: location, error: locationError } = await supabaseAdmin.from("locations").select("id,subscription_status,owner_email").eq("id", commission.location_id).maybeSingle();
    if (locationError) throw locationError;
    if (!location || !["active", "trialing"].includes(String(location.subscription_status || "").toLowerCase())) {
      await supabaseAdmin.from("creator_partner_commissions").update({ status: "reversed", reversed_at: now, reversal_reason: "Essentials+ was not active at the end of validation.", updated_at: now }).eq("id", commission.id).neq("status", "paid");
      summary.reversed += 1;
      continue;
    }
    const { data: creator, error: creatorError } = await supabaseAdmin.from("gtm_creator_sources").select("id,creator_key,display_name,email,user_id,referral_code,referral_window_days,commission_amount_cents,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,application_status,status").eq("id", commission.creator_source_id).maybeSingle();
    if (creatorError) throw creatorError;
    if (!creator || creator.application_status !== "approved" || creator.status !== "active") {
      await supabaseAdmin.from("creator_partner_commissions").update({ status: "needs_review", updated_at: now, fraud_flags: { creator_not_active: true } }).eq("id", commission.id);
      summary.needsReview += 1;
      continue;
    }
    if (creator.email && location.owner_email && String(creator.email).toLowerCase() === String(location.owner_email).toLowerCase()) {
      await supabaseAdmin.from("creator_partner_commissions").update({ status: "needs_review", updated_at: now, fraud_flags: { possible_self_referral: true } }).eq("id", commission.id);
      summary.needsReview += 1;
      continue;
    }
    if (!creator.stripe_connect_account_id) {
      await supabaseAdmin.from("creator_partner_commissions").update({ status: "approved", approved_at: now, updated_at: now }).eq("id", commission.id);
      summary.approved += 1;
      continue;
    }
    const connect = await refreshCreatorConnectStatus(creator as CreatorRow);
    if (!connect.ready) {
      await supabaseAdmin.from("creator_partner_commissions").update({ status: "approved", approved_at: now, updated_at: now }).eq("id", commission.id);
      summary.approved += 1;
      continue;
    }
    if (commission.stripe_transfer_id) continue;
    const transfer = await stripeRequest<{ id: string }>("/transfers", { body: new URLSearchParams({ amount: String(commission.amount_cents), currency: String(commission.currency || "usd"), destination: String(creator.stripe_connect_account_id), "metadata[creator_source_id]": String(creator.id), "metadata[commission_id]": String(commission.id), "metadata[location_id]": String(commission.location_id || ""), "metadata[program]": "creator_partner" }), idempotencyKey: `creator-commission-transfer-${commission.id}` });
    const paidAt = new Date().toISOString();
    await supabaseAdmin.from("creator_partner_commissions").update({ status: "paid", approved_at: paidAt, payable_at: paidAt, paid_at: paidAt, stripe_transfer_id: transfer.id, updated_at: paidAt }).eq("id", commission.id);
    summary.paid += 1;
    if (creator.email) await sendRawBrandedEmail({ to: creator.email, department: "account", subject: `Your $${(Number(commission.amount_cents) / 100).toFixed(0)} creator payout was sent`, heading: "Your Creator Partner payout is on the way", body: `We sent your $${(Number(commission.amount_cents) / 100).toFixed(0)} commission through Stripe. Your bank timing depends on your Stripe payout settings.`, cta: { label: "View creator dashboard", url: `${getSiteUrl()}/creator/dashboard` } });
  }
  return summary;
}
