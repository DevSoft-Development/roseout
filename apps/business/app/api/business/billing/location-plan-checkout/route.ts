import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl, getStripeModeForLocation, stripeRequest } from "@/lib/stripe/server";
import { isBusinessPlanKey, getLocationSubscriptionPriceId } from "@/lib/business/paid-plan-billing";

export async function POST(request: NextRequest) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const form = await request.formData();
  const plan = form.get("plan");
  const requestedId = String(form.get("location_id") || "").trim();
  if (!isBusinessPlanKey(plan) || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestedId))
    return NextResponse.json({ error: "Invalid plan or location" }, { status: 400 });
  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, requestedId);
  if (!authorized) return NextResponse.json({ error: "Approved ownership required" }, { status: 403 });
  const location = authorized.location;
  if (location.is_demo) return NextResponse.json({ error: "Demo checkout disabled" }, { status: 403 });
  if (location.stripe_subscription_id && ["active", "trialing", "past_due", "grace_period", "incomplete", "unpaid", "paused"].includes(String(location.subscription_status || "").toLowerCase()))
    return NextResponse.json({ error: "Manage existing subscription" }, { status: 409 });
  const mode = getStripeModeForLocation(location);
  const price = getLocationSubscriptionPriceId(plan, { ...process.env, VERCEL_ENV: mode === "live" ? "production" : "preview" });
  if (!price) return NextResponse.json({ error: "Stripe price is not configured" }, { status: 503 });
  // Fail closed until webhook handling and paid entitlements are certified.
  if (process.env.LOCATION_PLAN_CHECKOUT_ENABLED !== "true")
    return NextResponse.json({ error: "Checkout is not enabled yet" }, { status: 503 });
  const id = String(location.id);
  const siteUrl = getSiteUrl();
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${siteUrl}/business/dashboard/billing?location=${encodeURIComponent(id)}&checkout=return`,
    cancel_url: `${siteUrl}/business/plan-review?plan=${encodeURIComponent(plan)}&location_id=${encodeURIComponent(id)}`,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    "automatic_tax[enabled]": "true",
    billing_address_collection: "required",
    "payment_method_types[0]": "card",
    "metadata[source]": "location_plan_checkout",
    "metadata[plan]": plan,
    "metadata[location_id]": id,
    "subscription_data[metadata][source]": "location_plan_checkout",
    "subscription_data[metadata][plan]": plan,
    "subscription_data[metadata][location_id]": id,
  });
  if (location.stripe_customer_id) body.set("customer", String(location.stripe_customer_id));
  else if (user.email) body.set("customer_email", user.email);
  try {
    const session = await stripeRequest<{ url?: string }>("/checkout/sessions", {
      body, mode, idempotencyKey: `location-plan-${id}-${plan}-${randomUUID()}`,
    });
    if (!session.url || !session.url.startsWith("https://checkout.stripe.com/"))
      return NextResponse.json({ error: "Invalid Stripe checkout response" }, { status: 502 });
    return NextResponse.redirect(session.url, 303);
  } catch {
    return NextResponse.json({ error: "Checkout unavailable" }, { status: 502 });
  }
}
