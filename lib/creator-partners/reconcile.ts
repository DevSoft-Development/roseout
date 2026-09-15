import "server-only";

import { createCreatorCommissionFromPaidInvoice, processCreatorCommissions } from "@/lib/creator-partners/program";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  const commissions = await processCreatorCommissions(limit);
  return { referralsChecked: (referrals || []).length, conversionsFound, ...commissions };
}
