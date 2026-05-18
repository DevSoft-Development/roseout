import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please log in to manage billing." }, { status: 401 });
    }

    const formData = await request.formData();
    const locationId = String(formData.get("location_id") || "").trim();

    const [{ data: profile }, { data: location, error }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle(),
      locationId
        ? supabaseAdmin
            .from("locations")
            .select("id, owner_user_id, owner_email, claimed_by_email, stripe_customer_id")
            .eq("id", locationId)
            .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const customerId = location?.stripe_customer_id || profile?.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer is connected to this account yet." }, { status: 400 });
    }

    const siteUrl = getSiteUrl();
    const body = new URLSearchParams({
      customer: customerId,
      return_url: `${siteUrl}/business/dashboard/billing${locationId ? `?location=${encodeURIComponent(locationId)}` : ""}`,
    });

    const session = await stripeRequest<{ url?: string }>("/billing_portal/sessions", { body });

    if (!session.url) {
      return NextResponse.json({ error: "Unable to create billing portal session." }, { status: 500 });
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to open billing portal." },
      { status: 500 },
    );
  }
}
