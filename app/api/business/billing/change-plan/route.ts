import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getBusinessProPriceId, stripeRequest } from "@/lib/stripe/server";

const MANAGEABLE_STATUSES = new Set(["active", "trialing", "past_due", "grace_period", "incomplete", "unpaid", "paused"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to change subscription." }, { status: 401 });

  const body = await request.formData();
  const locationId = String(body.get("location_id") || "").trim();
  const action = String(body.get("action") || "").trim().toLowerCase();
  const requestedPlan = String(body.get("plan") || "").trim().toLowerCase();
  const interval = String(body.get("interval") || "").trim().toLowerCase() === "annual" ? "annual" : "monthly";
  if (!locationId) return NextResponse.json({ error: "Location is required." }, { status: 400 });

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const canonicalLocationId = String(authorized.location.id);
  const subscriptionId = String(authorized.location.stripe_subscription_id || "").trim();
  const status = String(authorized.location.subscription_status || "").toLowerCase();
  const redirectToBilling = (result: string) => NextResponse.redirect(
    new URL(`/business/dashboard/billing?location=${encodeURIComponent(canonicalLocationId)}&billing_action=${encodeURIComponent(result)}`, request.url),
    303,
  );

  const wantsCancel = action === "cancel" || requestedPlan === "free" || requestedPlan === "free_discovery";
  if (wantsCancel) {
    if (subscriptionId && MANAGEABLE_STATUSES.has(status)) {
      await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        body: new URLSearchParams({ cancel_at_period_end: "true" }),
      });
      await supabaseAdmin.from("locations").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("id", canonicalLocationId);
    } else {
      await supabaseAdmin.from("locations").update({
        subscription_plan: "free_discovery",
        subscription_status: "inactive",
        cancel_at_period_end: false,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", canonicalLocationId);
    }
    return redirectToBilling("cancel_scheduled");
  }

  if (!subscriptionId || !MANAGEABLE_STATUSES.has(status)) {
    return NextResponse.json({ error: "Start Partner Pro through checkout before changing this subscription." }, { status: 409 });
  }

  if (action === "reactivate") {
    await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      body: new URLSearchParams({ cancel_at_period_end: "false" }),
    });
    await supabaseAdmin.from("locations").update({ cancel_at_period_end: false, canceled_at: null, updated_at: new Date().toISOString() }).eq("id", canonicalLocationId);
    return redirectToBilling("reactivated");
  }

  if (action === "change_interval") {
    const subscription = await stripeRequest<{ items?: { data?: Array<{ id?: string }> } }>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "GET" },
    );
    const itemId = subscription.items?.data?.[0]?.id;
    if (!itemId) return NextResponse.json({ error: "Stripe subscription item could not be resolved." }, { status: 409 });

    const priceId = getBusinessProPriceId(interval);
    await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      body: new URLSearchParams({
        "items[0][id]": itemId,
        "items[0][price]": priceId,
        proration_behavior: "create_prorations",
        cancel_at_period_end: "false",
        "metadata[plan]": "business_pro",
        "metadata[interval]": interval,
        "metadata[location_id]": canonicalLocationId,
      }),
      idempotencyKey: `business-pro-interval-${subscriptionId}-${interval}`,
    });
    await supabaseAdmin.from("locations").update({ cancel_at_period_end: false, updated_at: new Date().toISOString() }).eq("id", canonicalLocationId);
    return redirectToBilling(`interval_${interval}`);
  }

  return NextResponse.json({ error: "Unsupported billing action." }, { status: 400 });
}
