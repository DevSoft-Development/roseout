import "server-only";

import { createCreatorCommissionFromPaidInvoice, processCreatorCommissions } from "@/lib/creator-partners/program";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function reverseRefundedOrDisputedCommissions(limit: number) {
  const { data: commissions, error } = await supabaseAdmin
    .from("creator_partner_commissions")
    .select("id,location_id,qualifying_payment_at,status")
    .in("status", ["validating", "approved", "payable"])
    .not("location_id", "is", null)
    .order("qualifying_payment_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw error;

  let reversed = 0;
  for (const commission of commissions || []) {
    const locationId = String(commission.location_id || "");
    if (!locationId) continue;
    let query = supabaseAdmin
      .from("payment_logs")
      .select("id,event_type,created_at")
      .eq("location_id", locationId)
      .in("event_type", ["charge.refunded", "charge.dispute.created"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (commission.qualifying_payment_at) query = query.gte("created_at", String(commission.qualifying_payment_at));
    const { data: paymentEvent, error: paymentError } = await query.maybeSingle();
    if (paymentError) throw paymentError;
    if (!paymentEvent?.id) continue;

    const reason = paymentEvent.event_type === "charge.dispute.created" ? "qualifying_payment_disputed" : "qualifying_payment_refunded";
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("creator_partner_commissions")
      .update({ status: "reversed", reversed_at: now, reversal_reason: reason, updated_at: now })
      .eq("id", commission.id)
      .in("status", ["validating", "approved", "payable"]);
    if (updateError) throw updateError;
    reversed += 1;
  }
  return reversed;
}

export async function reconcileCreatorPartnerProgram(limit = 150) {
  const now = new Date().toISOString();
  const { data: referrals, error } = await supabaseAdmin
    .from("gtm_referrals")
    .select("id,referred_location_id,status,expires_at")
    .not("creator_source_id", "is", null)
    .in("status", ["referred", "engaged", "claimed"])
    .gte("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)));
  if (error) throw error;

  let conversionsFound = 0;
  for (const referral of referrals || []) {
    if (!referral.referred_location_id) continue;
    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,subscription_status,last_payment_succeeded_at,stripe_customer_id,stripe_subscription_id")
      .eq("id", referral.referred_location_id)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location?.last_payment_succeeded_at || !["active", "trialing"].includes(String(location.subscription_status || "").toLowerCase())) continue;
    const paidAt = new Date(location.last_payment_succeeded_at).toISOString();
    if (referral.expires_at && paidAt > new Date(referral.expires_at).toISOString()) continue;
    const commission = await createCreatorCommissionFromPaidInvoice({
      locationId: String(location.id),
      invoiceId: `reconciled:${location.id}:${paidAt}`,
      customerId: location.stripe_customer_id ? String(location.stripe_customer_id) : null,
      subscriptionId: location.stripe_subscription_id ? String(location.stripe_subscription_id) : null,
      paidAt,
    });
    if (commission) conversionsFound += 1;
  }

  const refundReversals = await reverseRefundedOrDisputedCommissions(limit);
  const commissions = await processCreatorCommissions(limit);
  return { referralsChecked: (referrals || []).length, conversionsFound, refundReversals, ...commissions };
}
