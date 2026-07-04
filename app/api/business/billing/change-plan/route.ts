import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { stripeRequest } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in to change subscription." }, { status: 401 });
  }

  const body = await request.formData();
  const locationId = String(body.get("location_id") || "").trim();
  const requestedPlan = String(body.get("plan") || "free").toLowerCase();
  const nextPlan: "business_pro" | "free_discovery" = ["pro", "business_pro"].includes(requestedPlan) ? "business_pro" : "free_discovery";

  if (!locationId) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (nextPlan === "business_pro") {
    return NextResponse.json({ error: "Business Pro upgrades must be completed through checkout." }, { status: 403 });
  }

  const subscriptionId = String(authorized.location.stripe_subscription_id || "").trim();
  if (subscriptionId && ["active", "trialing", "past_due", "incomplete", "unpaid"].includes(String(authorized.location.subscription_status || "").toLowerCase())) {
    await stripeRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      body: new URLSearchParams({ cancel_at_period_end: "true" }),
    });
    await supabaseAdmin.from("locations").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("id", String(authorized.location.id));
  } else {
    await supabaseAdmin
      .from("locations")
      .update({
        subscription_plan: "free_discovery",
        subscription_status: "inactive",
        cancel_at_period_end: false,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", String(authorized.location.id));
  }

  return NextResponse.redirect(new URL(`/business/dashboard/billing?location=${String(authorized.location.id)}&plan_changed=1`, request.url), 303);
}
