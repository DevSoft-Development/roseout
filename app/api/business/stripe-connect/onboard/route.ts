import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
    const form = await request.formData();
    const locationId = String(form.get("location_id") || "").trim();
    const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
    if (!authorized) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    let accountId = String(authorized.location.stripe_connect_account_id || "");
    if (!accountId) {
      const account = await stripeRequest<{ id: string }>("/accounts", {
        body: new URLSearchParams({
          type: "express",
          country: "US",
          email: user.email || authorized.location.owner_email || "",
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "metadata[location_id]": locationId,
        }),
        idempotencyKey: `connect-account-${locationId}`,
      });
      accountId = account.id;
      const { error } = await supabaseAdmin.from("locations").update({ stripe_connect_account_id: accountId, stripe_connect_onboarding_status: "pending" }).eq("id", locationId);
      if (error) throw error;
    }

    const siteUrl = getSiteUrl();
    const link = await stripeRequest<{ url: string }>("/account_links", {
      body: new URLSearchParams({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${siteUrl}/business/dashboard/billing?location=${encodeURIComponent(locationId)}&connect=refresh`,
        return_url: `${siteUrl}/api/business/stripe-connect/return?location_id=${encodeURIComponent(locationId)}`,
      }),
    });
    return NextResponse.redirect(link.url, 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Stripe onboarding." }, { status: 500 });
  }
}
