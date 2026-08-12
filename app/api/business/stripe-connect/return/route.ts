import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("location_id") || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${getSiteUrl()}/login`);
  const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!authorized?.location.stripe_connect_account_id) return NextResponse.redirect(`${getSiteUrl()}/business/dashboard/billing?connect=missing`);
  try {
    const account = await stripeRequest<any>(`/accounts/${encodeURIComponent(authorized.location.stripe_connect_account_id)}`, { method: "GET" });
    const ready = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled);
    const { error } = await supabaseAdmin.from("locations").update({
      stripe_connect_onboarding_status: ready ? "complete" : account.details_submitted ? "restricted" : "pending",
      stripe_connect_details_submitted: Boolean(account.details_submitted),
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_connect_updated_at: new Date().toISOString(),
    }).eq("id", locationId);
    if (error) throw error;
    return NextResponse.redirect(`${getSiteUrl()}/business/dashboard/billing?location=${encodeURIComponent(locationId)}&connect=${ready ? "ready" : "incomplete"}`);
  } catch {
    return NextResponse.redirect(`${getSiteUrl()}/business/dashboard/billing?location=${encodeURIComponent(locationId)}&connect=error`);
  }
}
