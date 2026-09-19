import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please log in to manage billing." }, { status: 401 });

    const formData = await request.formData();
    const locationId = String(formData.get("location_id") || "").trim();
    if (!locationId) return NextResponse.json({ error: "Choose a location before opening billing." }, { status: 400 });

    const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
    if (!authorized) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const customerId = String(authorized.location.stripe_customer_id || "").trim();
    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer is connected to this location yet." }, { status: 400 });
    }

    const siteUrl = getSiteUrl();
    const body = new URLSearchParams({
      customer: customerId,
      return_url: `${siteUrl}/business/dashboard/billing?location=${encodeURIComponent(locationId)}`,
    });
    const session = await stripeRequest<{ url?: string }>("/billing_portal/sessions", { body });
    if (!session.url) return NextResponse.json({ error: "Unable to create billing portal session." }, { status: 500 });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to open billing portal." }, { status: 500 });
  }
}
