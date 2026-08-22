import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { stripeRequest } from "@/lib/stripe/server";
import { calculateSubscriptionTenureMonths, getRetentionOffer } from "@/lib/billing/retention";

const REASONS = new Set(["too_expensive", "not_using_enough", "missing_features", "business_closed", "switching_service", "temporary_pause", "other"]);

type StripeSubscription = {
  id: string;
  created?: number;
  current_period_end?: number;
  status?: string;
  cancel_at_period_end?: boolean;
  items?: { data?: Array<{ price?: { recurring?: { interval?: string | null } } }> };
};

type StripeCoupon = { id: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const locationId = String(form.get("location_id") || "").trim();
  const decision = String(form.get("decision") || "").trim();
  const reasonCode = String(form.get("reason_code") || "").trim();
  const reasonText = String(form.get("reason_text") || "").trim().slice(0, 2000);
  if (!locationId || !["accept_offer", "confirm_cancel"].includes(decision)) {
    return NextResponse.json({ error: "Invalid cancellation request." }, { status: 400 });
  }
  if (!REASONS.has(reasonCode)) {
    return NextResponse.json({ error: "Please select a cancellation reason." }, { status: 400 });
  }
  if (reasonCode === "other" && reasonText.length < 3) {
    return NextResponse.json({ error: "Please tell us why you want to cancel." }, { status: 400 });
  }

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,stripe_subscription_id,current_period_end,cancel_at_period_end,subscription_status")
    .eq("id", locationId)
    .single();
  if (locationError || !location?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active Stripe subscription was found for this location." }, { status: 409 });
  }

  const subscription = await stripeRequest<StripeSubscription>(`/subscriptions/${encodeURIComponent(location.stripe_subscription_id)}`, { method: "GET" });
  const tenureMonths = calculateSubscriptionTenureMonths(subscription.created);
  const offer = getRetentionOffer(tenureMonths);
  const annual = subscription.items?.data?.[0]?.price?.recurring?.interval === "year";
  const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : location.current_period_end || null;

  const { data: acceptedBefore } = await supabaseAdmin
    .from("subscription_cancellation_feedback")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .eq("offer_accepted", true)
    .limit(1)
    .maybeSingle();

  if (decision === "accept_offer") {
    if (acceptedBefore) {
      return NextResponse.redirect(new URL(`/locations/dashboard/billing?retention=already_used`, request.url), 303);
    }

    const couponParams = new URLSearchParams({
      percent_off: String(offer.discountPercent),
      duration: annual ? "once" : "repeating",
      name: `TheOutHaven retention ${offer.discountPercent}%`,
      "metadata[location_id]": locationId,
      "metadata[stripe_subscription_id]": subscription.id,
      "metadata[tenure_months]": String(tenureMonths),
      "metadata[billing_interval]": annual ? "annual" : "monthly",
    });
    if (!annual) couponParams.set("duration_in_months", String(offer.discountMonths));

    const coupon = await stripeRequest<StripeCoupon>("/coupons", {
      body: couponParams,
      idempotencyKey: `retention-coupon-${subscription.id}-${offer.discountPercent}-${annual ? "annual" : offer.discountMonths}`,
    });

    await stripeRequest(`/subscriptions/${encodeURIComponent(subscription.id)}`, {
      body: new URLSearchParams({
        "discounts[0][coupon]": coupon.id,
        cancel_at_period_end: "false",
        "metadata[retention_offer_applied]": "true",
        "metadata[retention_discount_percent]": String(offer.discountPercent),
        "metadata[retention_discount_months]": annual ? "0" : String(offer.discountMonths),
      }),
      idempotencyKey: `retention-apply-${subscription.id}-${coupon.id}`,
    });

    const { error: feedbackError } = await supabaseAdmin.from("subscription_cancellation_feedback").insert({
      location_id: locationId,
      user_id: user.id,
      stripe_subscription_id: subscription.id,
      reason_code: reasonCode,
      reason_text: reasonText || null,
      tenure_months: tenureMonths,
      offered_discount_percent: offer.discountPercent,
      offered_discount_months: annual ? null : offer.discountMonths,
      offer_accepted: true,
      cancellation_scheduled: false,
      current_period_end: currentPeriodEnd,
      metadata: { source: "location_dashboard", decision: "accept_offer", billing_interval: annual ? "annual" : "monthly" },
    });
    if (feedbackError) console.error("Unable to record accepted retention offer", feedbackError.message);

    await supabaseAdmin.from("locations").update({ cancel_at_period_end: false, canceled_at: null, updated_at: new Date().toISOString() }).eq("id", locationId);
    return NextResponse.redirect(new URL(`/locations/dashboard/billing?retention=accepted`, request.url), 303);
  }

  await stripeRequest(`/subscriptions/${encodeURIComponent(subscription.id)}`, {
    body: new URLSearchParams({ cancel_at_period_end: "true" }),
  });

  const { error: feedbackError } = await supabaseAdmin.from("subscription_cancellation_feedback").insert({
    location_id: locationId,
    user_id: user.id,
    stripe_subscription_id: subscription.id,
    reason_code: reasonCode,
    reason_text: reasonText || null,
    tenure_months: tenureMonths,
    offered_discount_percent: acceptedBefore ? null : offer.discountPercent,
    offered_discount_months: acceptedBefore || annual ? null : offer.discountMonths,
    offer_accepted: false,
    cancellation_scheduled: true,
    current_period_end: currentPeriodEnd,
    metadata: { source: "location_dashboard", decision: "confirm_cancel", retention_offer_previously_used: Boolean(acceptedBefore), billing_interval: annual ? "annual" : "monthly" },
  });
  if (feedbackError) console.error("Unable to record cancellation feedback", feedbackError.message);

  await supabaseAdmin.from("locations").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("id", locationId);
  return NextResponse.redirect(new URL(`/locations/dashboard/billing?cancellation=scheduled`, request.url), 303);
}
