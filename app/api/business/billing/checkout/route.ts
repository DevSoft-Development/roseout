import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getBusinessProPriceId, getSiteUrl, stripeRequest } from "@/lib/stripe/server";
import { getLocationName } from "@/lib/locationName";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in to manage billing." }, { status: 401 });

    const formData = await request.formData();
    const locationId = String(formData.get("location_id") || "").trim();
    const interval = String(formData.get("interval") || "monthly") === "annual" ? "annual" : "monthly";
    if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });

    const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
    if (!authorized) return NextResponse.json({ error: "Location not found." }, { status: 404 });
    const location = authorized.location;

    if (location.stripe_subscription_id && ["active", "trialing", "past_due", "grace_period", "unpaid", "incomplete", "paused"].includes(String(location.subscription_status || "").toLowerCase())) {
      return NextResponse.json({ error: "This location already has a Stripe subscription. Use Manage Billing instead." }, { status: 409 });
    }

    const siteUrl = getSiteUrl();
    const body = new URLSearchParams({
      mode: "subscription",
      success_url: `${siteUrl}/business/dashboard/billing?upgraded=1&location=${encodeURIComponent(locationId)}`,
      cancel_url: `${siteUrl}/business/dashboard/billing?canceled=1&location=${encodeURIComponent(locationId)}`,
      "line_items[0][price]": getBusinessProPriceId(interval),
      "line_items[0][quantity]": "1",
      "automatic_tax[enabled]": "true",
      billing_address_collection: "required",
      "payment_method_types[0]": "card",
      "metadata[plan]": "business_pro",
      "metadata[plan_name]": "partner_pro",
      "metadata[interval]": interval,
      "metadata[location_id]": locationId,
      "metadata[businessName]": getLocationName(location, "TheOutHaven business"),
      "metadata[source]": "business_billing",
      "subscription_data[metadata][plan]": "business_pro",
      "subscription_data[metadata][plan_name]": "partner_pro",
      "subscription_data[metadata][interval]": interval,
      "subscription_data[metadata][location_id]": locationId,
    });

    if (location.stripe_customer_id) {
      body.set("customer", String(location.stripe_customer_id));
    } else {
      body.set("customer_email", user.email || String(location.owner_email || ""));
      body.set("customer_creation", "always");
    }

    const session = await stripeRequest<{ url?: string }>("/checkout/sessions", {
      body,
      idempotencyKey: `business-pro-${locationId}-${interval}-${randomUUID()}`,
    });
    if (!session.url) return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start checkout." }, { status: 500 });
  }
}
