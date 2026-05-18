import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBusinessProPriceId, getSiteUrl, stripeRequest } from "@/lib/stripe/server";
import { getLocationName } from "@/lib/locationName";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please log in to manage billing." }, { status: 401 });
    }

    const formData = await request.formData();
    const locationId = String(formData.get("location_id") || "").trim();

    if (!locationId) {
      return NextResponse.json({ error: "Missing location." }, { status: 400 });
    }

    const { data: location, error } = await supabaseAdmin
      .from("locations")
      .select("*")
      .eq("id", locationId)
      .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

    const siteUrl = getSiteUrl();
    const body = new URLSearchParams({
      mode: "subscription",
      success_url: `${siteUrl}/business/dashboard/billing?upgraded=1&location=${encodeURIComponent(locationId)}`,
      cancel_url: `${siteUrl}/business/dashboard/billing?canceled=1&location=${encodeURIComponent(locationId)}`,
      "line_items[0][price]": getBusinessProPriceId(),
      "line_items[0][quantity]": "1",
      customer_email: user.email || location.owner_email || "",
      "metadata[plan]": "business_pro",
      "metadata[location_id]": locationId,
      "metadata[businessName]": getLocationName(location, "TheOutHaven business"),
      "subscription_data[metadata][plan]": "business_pro",
      "subscription_data[metadata][location_id]": locationId,
    });

    const session = await stripeRequest<{ url?: string }>("/checkout/sessions", { body });

    if (!session.url) {
      return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 });
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start checkout." },
      { status: 500 },
    );
  }
}
